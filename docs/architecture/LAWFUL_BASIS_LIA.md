# Lawful Basis & Legitimate Interest Assessments — Apollo Discord Bot

## Lawful Basis per Processing Purpose (Art. 6)

| Purpose | Personal Data Categories | Lawful Basis (Art. 6) | Justification |
|---------|-------------------------|----------------------|---------------|
| Discord gateway connection (receive events) | User IDs, guild IDs, message content, member data | **Not applicable** — Discord is controller | Discord NL BV controls API Data; bot receives as processor |
| Guild configuration storage | Guild IDs, channel IDs, role IDs, settings | **Art. 6(1)(f) Legitimate Interest** | Operator has legitimate interest in configuring bot for their guild; minimal data, guild-scoped |
| User preference storage (language, timezone, notifications) | User IDs, preferences | **Art. 6(1)(b) Contract** / **Art. 6(1)(a) Consent** | User invokes commands to set preferences; direct relationship |
| Moderation history (warnings, bans, kicks, notes, cases) | User IDs, moderator IDs, reasons, timestamps | **Art. 6(1)(f) Legitimate Interest** | Guild admin has legitimate interest in maintaining server safety/order; data minimized to guild scope |
| Ticket management (creation, transcripts, participants) | User IDs, message content, channel IDs | **Art. 6(1)(b) Contract** / **Art. 6(1)(f) Legitimate Interest** | User requests support (contract); guild admin manages tickets (legitimate interest) |
| Utility features (levels, polls, reminders, giveaways, tags) | User IDs, activity data, votes, entries | **Art. 6(1)(f) Legitimate Interest** | Operator enables for engagement; users participate voluntarily |
| Automod rule enforcement (banned words, links, spam, invites) | User IDs, message content, timestamps | **Art. 6(1)(f) Legitimate Interest** | **Requires LIA** — see below |
| Threat scoring / spam profiling | User IDs, guild IDs, behavioral metrics, scores | **Art. 6(1)(f) Legitimate Interest** | **Requires LIA** — see below |
| Interlink cross-bot event sharing | User IDs, guild IDs, event data (joins, bans) | **Art. 6(1)(f) Legitimate Interest** | **Requires LIA** — see below |
| NSFW image detection | Image attachments (no personal data extracted) | **Art. 6(1)(f) Legitimate Interest** | No personal data processed; safety feature |
| Analytics / metrics aggregation | User IDs, guild IDs, command counts, detection counts | **Art. 6(1)(f) Legitimate Interest** | Operator interest in operational visibility; pseudonymized where possible |
| Security logging / audit trail | User IDs, guild IDs, action types, timestamps | **Art. 6(1)(f) Legitimate Interest** / **Art. 6(1)(c) Legal Obligation** | Security monitoring; potential legal obligation for audit trails |
| Data deletion request handling | User IDs, request timestamps, deletion summaries | **Art. 6(1)(c) Legal Obligation** | Art. 17/19 GDPR compliance; Art. 12 DSAR obligations |

---

## Legitimate Interest Assessment (LIA) — Template

**Three-part test per ICO/EDPB guidance:**
1. **Purpose Test** — Is there a legitimate interest?
2. **Necessity Test** — Is processing necessary for that purpose?
3. **Balancing Test** — Do individual rights override the interest?

---

### LIA 1: Automod Rule Enforcement

**1. Purpose Test:** Guild administrators have a legitimate interest in automatically enforcing server rules (spam, banned words, links, invites, raid protection) to maintain server safety, reduce moderator workload, and provide consistent enforcement.

**2. Necessity Test:** Automated enforcement is necessary because:
- Manual moderation doesn't scale for high-volume servers
- Real-time response (message deletion, timeout) prevents harm propagation
- Consistent rule application avoids human bias/fatigue
- No less intrusive alternative achieves same effectiveness

**3. Balancing Test:**
| Impact on Data Subject | Mitigation |
|------------------------|------------|
| Message content scanned | Only in guilds where automod enabled; opt-out via exempt channels/roles |
| Automated timeout/ban possible | **Art. 22 safeguard required**: human review for significant actions (ban, timeout > 1hr); appeal process |
| Profiling (spam count, violation history) | Scores not shared outside guild; auto-decay; user can request deletion |
| False positives | Configurable thresholds; exempt roles/channels; moderator override |

**Conclusion:** Legitimate interest **valid with safeguards**: human review for significant actions, transparency (log channel), user appeal, data minimization (guild-scoped only), retention limits.

**Safeguards Required (Art. 22):**
- Human review before ban/timeout > 1 hour
- Meaningful information about logic (public automod config)
- Right to obtain human intervention (appeal command)
- Right to contest decision

---

### LIA 2: Threat Scoring / Spam Profiling

**1. Purpose Test:** Operator has legitimate interest in identifying malicious actors (spammers, raiders, bad actors) to protect guild integrity and member experience.

**2. Necessity Test:** Threat scoring necessary because:
- Pattern detection requires historical behavioral data
- Cross-guild correlation (via interlink) improves detection
- Proactive prevention (raid mode, enhanced verification) requires scoring

**3. Balancing Test:**
| Impact on Data Subject | Mitigation |
|------------------------|------------|
| Continuous behavioral monitoring | Guild-scoped only; no cross-guild profile unless interlink enabled |
| Score influences treatment (stricter filters, auto-action) | Scores transparent to guild admins; users can't see own score (security) |
| Profiling = "automated decision-making" (Art. 22) | **Not solely automated** — scores inform moderators, don't directly ban |
| Data retention indefinite | **Must implement**: rolling window (e.g., 30 days), auto-decay |

**Conclusion:** Legitimate interest **valid with safeguards**: rolling retention window, guild-scoped, transparency to admins, not sole basis for significant decisions.

**Required Changes:**
- Implement 30-day rolling window for threat scores
- Auto-decay scores over time
- Document scoring factors in privacy policy

---

### LIA 3: Interlink Cross-Bot Event Sharing

**1. Purpose Test:** Operators of multiple bots have legitimate interest in sharing security events (bans, joins, raids) across their bot fleet for coordinated protection.

**2. Necessity Test:** Cross-bot sharing necessary because:
- Single bot has limited view; coordinated defense requires shared intelligence
- Real-time event propagation enables fleet-wide raid mode
- No alternative achieves same coordinated response

**3. Balancing Test:**
| Impact on Data Subject | Mitigation |
|------------------------|------------|
| Ban/join events shared to other bots | Only configured events (memberJoin, guildBanAdd); operator-controlled |
| User ID + guild ID shared | Pseudonymized to bot fleet; no message content |
| Joint controller relationship | **Art. 26 agreement needed** between bot operators |
| Data leaves original guild context | Trust domain defined by shared INTERLINK_AUTH_KEY |

**Conclusion:** Legitimate interest **valid with safeguards**: operator-controlled event types, trust domain via shared secret, Art. 26 joint controller agreement documented.

**Required Changes:**
- Document Art. 26 joint controller arrangement in interlink setup docs
- Make event forwarding opt-in per event type (already configurable)
- Ensure INTERLINK_AUTH_KEY rotation procedure

---

## Special Category Data (Art. 9) — Assessment

**No special category data processed.**
- NSFW detection analyzes images but does not extract/store biometric, health, racial, political, religious, sexual orientation, or genetic data
- No inference of special categories from message content
- No profiling that reveals special categories

**Art. 10 (Criminal Convictions):** Moderation records may reflect rule violations but not criminal convictions. No Art. 10 processing.
