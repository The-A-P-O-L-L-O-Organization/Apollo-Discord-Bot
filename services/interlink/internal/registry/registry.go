package registry

import (
	"context"
	"time"

	goredis "github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
	"google.golang.org/protobuf/encoding/protojson"

	interlinkv1 "github.com/the-a-p-o-l-l-o-organization/apollo-discord-bot/services/interlink/gen/go/interlink"
)

const (
	BotKeyPrefix = "interlink:bot:"
	BotIndexKey  = "interlink:bots:index"
	HeartbeatTTL = 2 * time.Minute
)

type Registry struct {
	client *goredis.Client
}

func NewRegistry(redisURL string) (*Registry, error) {
	opt, err := goredis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}
	opt.DisableIdentity = true
	return NewRegistryWithClient(goredis.NewClient(opt)), nil
}

func NewRegistryWithClient(client *goredis.Client) *Registry {
	return &Registry{client: client}
}

func (r *Registry) Client() *goredis.Client {
	return r.client
}

func (r *Registry) Close() error {
	return r.client.Close()
}

func (r *Registry) Ping(ctx context.Context) error {
	return r.client.Ping(ctx).Err()
}

func (r *Registry) Register(ctx context.Context, req *interlinkv1.RegisterBotRequest) (*interlinkv1.BotInfo, error) {
	now := time.Now().UnixMilli()
	info := &interlinkv1.BotInfo{
		BotId:         req.GetBotId(),
		Endpoint:      req.GetEndpoint(),
		Capabilities:  req.GetCapabilities(),
		RegisteredAt:  now,
		LastHeartbeat: now,
		Online:        true,
	}

	data, err := protojson.Marshal(info)
	if err != nil {
		return nil, err
	}

	pipe := r.client.TxPipeline()
	pipe.Set(ctx, BotKeyPrefix+req.GetBotId(), data, 0)
	pipe.SAdd(ctx, BotIndexKey, req.GetBotId())
	pipe.Expire(ctx, BotKeyPrefix+req.GetBotId()+":heartbeat", HeartbeatTTL)
	_, err = pipe.Exec(ctx)

	return info, err
}

func (r *Registry) Heartbeat(ctx context.Context, botID string) error {
	key := BotKeyPrefix + botID
	data, err := r.client.Get(ctx, key).Bytes()
	if err != nil {
		return err
	}

	var info interlinkv1.BotInfo
	if err := protojson.Unmarshal(data, &info); err != nil {
		return err
	}

	info.LastHeartbeat = time.Now().UnixMilli()
	info.Online = true

	newData, err := protojson.Marshal(&info)
	if err != nil {
		return err
	}
	pipe := r.client.TxPipeline()
	pipe.Set(ctx, key, newData, 0)
	pipe.Expire(ctx, key+":heartbeat", HeartbeatTTL)
	_, err = pipe.Exec(ctx)
	return err
}

func (r *Registry) Unregister(ctx context.Context, botID string) error {
	pipe := r.client.TxPipeline()
	pipe.Del(ctx, BotKeyPrefix+botID)
	pipe.Del(ctx, BotKeyPrefix+botID+":heartbeat")
	pipe.SRem(ctx, BotIndexKey, botID)
	_, err := pipe.Exec(ctx)
	return err
}

func (r *Registry) Get(ctx context.Context, botID string) (*interlinkv1.BotInfo, error) {
	data, err := r.client.Get(ctx, BotKeyPrefix+botID).Bytes()
	if err != nil {
		return nil, err
	}
	var info interlinkv1.BotInfo
	if err := protojson.Unmarshal(data, &info); err != nil {
		return nil, err
	}
	if time.Since(time.UnixMilli(info.GetLastHeartbeat())) > HeartbeatTTL {
		info.Online = false
	}
	return &info, nil
}

func (r *Registry) List(ctx context.Context) ([]*interlinkv1.BotInfo, error) {
	botIDs, err := r.client.SMembers(ctx, BotIndexKey).Result()
	if err != nil {
		return nil, err
	}

	bots := make([]*interlinkv1.BotInfo, 0, len(botIDs))
	for _, id := range botIDs {
		info, err := r.Get(ctx, id)
		if err != nil {
			log.Warn().Err(err).Str("bot_id", id).Msg("Failed to get bot info")
			continue
		}
		bots = append(bots, info)
	}
	return bots, nil
}
