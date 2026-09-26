package auth

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"connectrpc.com/connect"
	goredis "github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"

	interlinkv1 "github.com/the-a-p-o-l-l-o-organization/apollo-discord-bot/services/interlink/gen/go/interlink"
)

var (
	ErrMissingAuth      = errors.New("missing authorization header")
	ErrInvalidAuth      = errors.New("invalid authorization format")
	ErrInvalidSignature = errors.New("invalid signature")
	ErrTimestampSkew    = errors.New("timestamp skew too large")
	ErrReplayDetected   = errors.New("replay attack detected")
	ErrUnknownBot       = errors.New("unknown bot identity")
)

const (
	AuthHeader       = "Authorization"
	AuthScheme       = "HMAC-SHA256"
	TimestampHeader  = "X-Interlink-Timestamp"
	NonceHeader      = "X-Interlink-Nonce"
	BotHeader        = "X-Interlink-Bot"
	MaxTimestampSkew = 5 * time.Minute
	NonceTTL         = 10 * time.Minute
	NonceKeyPrefix   = "interlink:nonce:"
)

func EmptyBodyHash() string {
	sum := sha256.Sum256(nil)
	return hex.EncodeToString(sum[:])
}

func BodyHash(msg proto.Message) (string, error) {
	data, err := protojson.Marshal(msg)
	if err != nil {
		return "", err
	}
	canon, err := canonicalProtoJSON(msg.ProtoReflect().Descriptor(), data)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(canon)
	return hex.EncodeToString(sum[:]), nil
}

// canonicalProtoJSON re-marshals protojson output deterministically: message
// fields are emitted in field-number order with map entries sorted by key.
// This mirrors the Node client's bodyHashOf, which JSON-stringifies the
// protobuf-es toJson object (field order, compact separators) after sorting
// map keys. protojson emits Go maps in randomized iteration order, so without
// this step any message with 2+ map entries hashes nondeterministically.
func canonicalProtoJSON(desc protoreflect.MessageDescriptor, data []byte) ([]byte, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	if err := writeCanonicalMessage(&buf, desc, v); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func writeCanonicalMessage(buf *bytes.Buffer, desc protoreflect.MessageDescriptor, v any) error {
	obj, ok := v.(map[string]any)
	if !ok {
		return writeCanonicalScalar(buf, v)
	}
	buf.WriteByte('{')
	first := true
	fields := desc.Fields()
	for i := 0; i < fields.Len(); i++ {
		fd := fields.Get(i)
		val, present := obj[fd.JSONName()]
		if !present {
			continue
		}
		if !first {
			buf.WriteByte(',')
		}
		first = false
		writeJSONString(buf, fd.JSONName())
		buf.WriteByte(':')
		if err := writeCanonicalValue(buf, fd, val); err != nil {
			return err
		}
	}
	buf.WriteByte('}')
	return nil
}

func writeCanonicalValue(buf *bytes.Buffer, fd protoreflect.FieldDescriptor, v any) error {
	if fd.IsMap() {
		obj, ok := v.(map[string]any)
		if !ok {
			return writeCanonicalScalar(buf, v)
		}
		keys := make([]string, 0, len(obj))
		for k := range obj {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		buf.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				buf.WriteByte(',')
			}
			writeJSONString(buf, k)
			buf.WriteByte(':')
			if vd := fd.MapValue(); vd != nil && vd.Message() != nil && vd.Kind() == protoreflect.MessageKind {
				if err := writeCanonicalMessage(buf, vd.Message(), obj[k]); err != nil {
					return err
				}
				continue
			}
			if err := writeCanonicalScalar(buf, obj[k]); err != nil {
				return err
			}
		}
		buf.WriteByte('}')
		return nil
	}
	if fd.IsList() {
		items, ok := v.([]any)
		if !ok {
			return writeCanonicalScalar(buf, v)
		}
		buf.WriteByte('[')
		for i, item := range items {
			if i > 0 {
				buf.WriteByte(',')
			}
			if fd.Kind() == protoreflect.MessageKind || fd.Kind() == protoreflect.GroupKind {
				if fd.Message() == nil {
					return writeCanonicalScalar(buf, item)
				}
				if err := writeCanonicalMessage(buf, fd.Message(), item); err != nil {
					return err
				}
				continue
			}
			if err := writeCanonicalScalar(buf, item); err != nil {
				return err
			}
		}
		buf.WriteByte(']')
		return nil
	}
	if fd.Kind() == protoreflect.MessageKind || fd.Kind() == protoreflect.GroupKind {
		if fd.Message() == nil {
			return writeCanonicalScalar(buf, v)
		}
		return writeCanonicalMessage(buf, fd.Message(), v)
	}
	return writeCanonicalScalar(buf, v)
}

// writeCanonicalScalar emits a JSON scalar with the same escaping as
// JavaScript's JSON.stringify (no HTML escaping of <, >, &).
func writeCanonicalScalar(buf *bytes.Buffer, v any) error {
	var tmp bytes.Buffer
	enc := json.NewEncoder(&tmp)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return err
	}
	buf.Write(bytes.TrimRight(tmp.Bytes(), "\n"))
	return nil
}

func writeJSONString(buf *bytes.Buffer, s string) {
	var tmp bytes.Buffer
	enc := json.NewEncoder(&tmp)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(s)
	buf.Write(bytes.TrimRight(tmp.Bytes(), "\n"))
}

func CanonicalString(procedure, timestamp, nonce, bodyHash string) string {
	return strings.Join([]string{procedure, timestamp, nonce, bodyHash}, "\n")
}

func Sign(secretKey, procedure, timestamp, nonce, bodyHash string) string {
	mac := hmac.New(sha256.New, []byte(secretKey))
	mac.Write([]byte(CanonicalString(procedure, timestamp, nonce, bodyHash)))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

func GenerateNonce() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

type NonceStore interface {
	CheckAndSet(ctx context.Context, nonce string, ttl time.Duration) (bool, error)
}

type Verifier struct {
	secretKey []byte
	nonces    NonceStore
}

func NewVerifier(secretKey string, nonces NonceStore) *Verifier {
	return &Verifier{secretKey: []byte(secretKey), nonces: nonces}
}

func (v *Verifier) Verify(ctx context.Context, req connect.AnyRequest) (string, error) {
	bodyHash, err := BodyHash(req.Any().(proto.Message))
	if err != nil {
		return "", err
	}
	if err := v.VerifyHandshake(req.Header(), req.Spec().Procedure, bodyHash); err != nil {
		return "", err
	}
	if err := v.checkNonce(ctx, req.Header().Get(NonceHeader)); err != nil {
		return "", err
	}
	botID := ExtractBotID(req.Any())
	if botID == "" {
		botID = req.Header().Get(BotHeader)
	}
	if botID == "" {
		return "", ErrUnknownBot
	}
	return botID, nil
}

func (v *Verifier) VerifyHandshake(header http.Header, procedure, bodyHash string) error {
	auth := header.Get(AuthHeader)
	if auth == "" {
		return ErrMissingAuth
	}
	parts := strings.SplitN(auth, " ", 2)
	if len(parts) != 2 || parts[0] != AuthScheme {
		return ErrInvalidAuth
	}
	signature, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		return ErrInvalidSignature
	}

	timestampStr := header.Get(TimestampHeader)
	nonce := header.Get(NonceHeader)
	if timestampStr == "" || nonce == "" {
		return ErrInvalidAuth
	}
	timestamp, err := strconv.ParseInt(timestampStr, 10, 64)
	if err != nil {
		return ErrInvalidAuth
	}
	if time.Since(time.UnixMilli(timestamp)).Abs() > MaxTimestampSkew {
		return ErrTimestampSkew
	}

	mac := hmac.New(sha256.New, v.secretKey)
	mac.Write([]byte(CanonicalString(procedure, timestampStr, nonce, bodyHash)))
	if !hmac.Equal(signature, mac.Sum(nil)) {
		log.Debug().
			Str("procedure", procedure).
			Msg("Signature mismatch")
		return ErrInvalidSignature
	}
	return nil
}

func (v *Verifier) VerifyMessage(ctx context.Context, nonce string, timestampMillis int64) error {
	if nonce == "" {
		return ErrInvalidAuth
	}
	if time.Since(time.UnixMilli(timestampMillis)).Abs() > MaxTimestampSkew {
		return ErrTimestampSkew
	}
	return v.checkNonce(ctx, nonce)
}

func (v *Verifier) CheckNonce(ctx context.Context, nonce string) error {
	if nonce == "" {
		return ErrInvalidAuth
	}
	return v.checkNonce(ctx, nonce)
}

func (v *Verifier) checkNonce(ctx context.Context, nonce string) error {
	isNew, err := v.nonces.CheckAndSet(ctx, nonce, NonceTTL)
	if err != nil {
		return err
	}
	if !isNew {
		return ErrReplayDetected
	}
	return nil
}

func ExtractBotID(msg any) string {
	switch m := msg.(type) {
	case *interlinkv1.Envelope:
		return m.GetSource()
	case *interlinkv1.RegisterBotRequest:
		return m.GetBotId()
	case *interlinkv1.HeartbeatRequest:
		return m.GetBotId()
	case *interlinkv1.SubscribeRequest:
		return m.GetBotId()
	case *interlinkv1.UnregisterBotRequest:
		return m.GetBotId()
	case *interlinkv1.GetBotInfoRequest:
		return m.GetBotId()
	default:
		return ""
	}
}

type RedisNonceStore struct {
	client *goredis.Client
}

func NewRedisNonceStore(client *goredis.Client) *RedisNonceStore {
	return &RedisNonceStore{client: client}
}

func (r *RedisNonceStore) CheckAndSet(ctx context.Context, nonce string, ttl time.Duration) (bool, error) {
	return r.client.SetNX(ctx, NonceKeyPrefix+nonce, "1", ttl).Result()
}

type InMemoryNonceStore struct {
	mu     sync.Mutex
	nonces map[string]time.Time
}

func NewInMemoryNonceStore() *InMemoryNonceStore {
	return &InMemoryNonceStore{nonces: make(map[string]time.Time)}
}

func (s *InMemoryNonceStore) CheckAndSet(_ context.Context, nonce string, ttl time.Duration) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	for k, exp := range s.nonces {
		if now.After(exp) {
			delete(s.nonces, k)
		}
	}
	if _, ok := s.nonces[nonce]; ok {
		return false, nil
	}
	s.nonces[nonce] = now.Add(ttl)
	return true, nil
}
