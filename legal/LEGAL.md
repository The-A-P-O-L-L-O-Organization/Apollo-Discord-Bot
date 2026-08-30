# Apollo Discord Bot Legal Documents

This directory contains the legal documents governing the use of the Apollo Discord Bot.

## Documents

- **[Terms of Service (TOS.md)](https://github.com/The-A-P-O-L-L-O-Organization/Apollo-Discord-Bot/blob/main/legal/TOS.md)** — Governs your use of the Bot software, operator responsibilities, and legal terms.
- **[Privacy Policy (PRIVACY.md)](https://github.com/The-A-P-O-L-L-O-Organization/Apollo-Discord-Bot/blob/main/legal/PRIVACY.md)** — Describes what data the Bot processes, how it is used, and your rights as a data subject.

## Operator Obligation: Inform Server Members

**Per [TOS.md Section 4](TOS.md#4-operator-responsibilities), as the operator of a self-hosted instance, you must:**

> Inform the members of any Discord server where the Bot is installed that the Bot is in use and that their messages and activity may be processed by the Bot.

You must also publish a contact channel (e.g., Discord user tag, email, or support server) so users can reach you with privacy requests, deletion requests, and reports. The Bot enforces this via the `OPERATOR_CONTACT` environment variable and the `/operator-contact` slash command.

## Example Notification Message

You may post the example message below in a visible channel (e.g., `#announcements`, `#general`, or a dedicated `#bot-notice` channel) when adding the Bot to a server, or you can write your own — the only requirement is that it informs members the Bot is in use and that their messages and activity may be processed.

---

**Apollo Discord Bot — Notice of Installation and Data Processing**

Hey everyone!

We've just added the **Apollo Discord Bot** to this server (self-hosted instance).

**What does this mean for you?**
The bot helps us with things like moderation, logging, analytics, translation, tickets, giveaways, polls, reminders, and a few other integrations we've enabled. To do its job, it reads messages and activity in this server — so your messages, user ID, display name, and general Discord activity may be processed and stored by this bot instance.

**Your rights**
You're in control of your data:

- Use `/data-deletion` in any channel (or DM the bot) to see what's stored about you and delete it if you want
- Use `/operator-contact` to find out how to reach the server operator with any questions, privacy requests, or concerns

**Operator contact:** `<@OPERATOR_USER_ID>` (or: `email@example.com` / `https://discord.gg/support-server`)

**Legal stuff** (if you're into that):

- [Terms of Service](https://github.com/The-A-P-O-L-L-O-Organization/Apollo-Discord-Bot/blob/main/legal/TOS.md)
- [Privacy Policy](https://github.com/The-A-P-O-L-L-O-Organization/Apollo-Discord-Bot/blob/main/legal/PRIVACY.md)

> This notice satisfies the operator's obligation under the Bot's Terms of Service to inform members that the Bot is in use and that their messages and activity may be processed.

Thanks for being here!

---

## Quick Checklist for Operators

- [ ] Set `OPERATOR_AGREEMENT=true` in `.env`
- [ ] Set `OPERATOR_CONTACT` in `.env` (your Discord tag, email, or support server invite)
- [ ] Post the notification message above in a visible channel
- [ ] Ensure `/operator-contact` and `/data-deletion` commands are accessible to members
- [ ] Review enabled features and configure only what your community expects
- [ ] Keep your Discord bot token, API keys, and database credentials secret
