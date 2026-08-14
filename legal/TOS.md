# Apollo Discord Bot Terms of Service

Last updated: 2026-08-14

These Terms of Service ("Terms") govern your use of the Apollo Discord Bot software ("the Bot", "the Software"). The Bot is open-source software licensed under the GNU General Public License v3.0 (GPLv3). By downloading, installing, configuring, or running the Bot, you agree to these Terms. If you do not agree, do not use the Bot.

## 1. Acceptance

By using the Bot, you confirm that you have the legal authority to accept these Terms on behalf of yourself and, where applicable, the organization you represent. If you are accepting on behalf of an organization, "you" refers to that organization.

### 1a. Operator Affirmative Acceptance

If you are operating a self-hosted instance of the Bot, you must affirmatively accept these Terms before the Bot will start. This is enforced by the Bot itself: it reads the `OPERATOR_AGREEMENT` environment variable from your `.env` file and refuses to start unless it is set to the literal string `true`.

By setting `OPERATOR_AGREEMENT=true` in your `.env` file, you affirm that:

- You have read and understood these Terms of Service in full.
- You have read and understood the Privacy Policy in `legal/PRIVACY.md` in full.
- You accept the operator responsibilities described in Section 4 below.
- You understand that you are the data controller for any personal data the Bot processes on your behalf, and that the upstream authors of the Bot are not responsible for your compliance with applicable laws or Discord's policies.

The literal-string requirement is intentional. Values such as `yes`, `1`, `True`, or `TRUE` will not satisfy this check. This prevents accidental acceptance via copy-paste from examples and ensures that setting `OPERATOR_AGREEMENT=true` is a deliberate act.

If you do not agree to these Terms, do not set `OPERATOR_AGREEMENT=true` and do not run the Bot.

## 2. License

The Bot is distributed under the GNU General Public License v3.0. Your use, modification, and redistribution of the Bot are governed by the GPLv3, not by these Terms, except where these Terms impose additional obligations specific to operating the Bot as a service. A copy of the GPLv3 is included with the source code and is also available at https://www.gnu.org/licenses/gpl-3.0.txt.

## 3. Self-Hosted Scope

The Bot is designed exclusively for self-hosting. There is no hosted service operated by the upstream author. When you run the Bot, you are the operator of an independent service that interacts with Discord on your behalf. You are solely responsible for:

- The infrastructure on which the Bot runs.
- The configuration of the Bot, including environment variables, feature toggles, and integration credentials.
- The data the Bot processes on your behalf.
- Compliance with Discord's Terms of Service (https://discord.com/terms), Discord's Developer Terms of Service (https://support-dev.discord.com/hc/en-us/articles/8562894815383), Discord's Developer Policy (https://support-dev.discord.com/hc/en-us/articles/8563934450327), and Discord's Community Guidelines (https://discord.com/guidelines).
- Compliance with all applicable laws in your jurisdiction.

The upstream author of the Bot makes no representation that the Bot is suitable for any particular purpose. You are responsible for evaluating whether the Bot meets your needs before deploying it.

## 4. Operator Responsibilities

As the operator of a self-hosted instance of the Bot, you agree to:

- Provide accurate configuration and credentials.
- Maintain the security of your deployment, including the secrecy of your Discord bot token, API keys, and database credentials.
- Inform the members of any Discord server where the Bot is installed that the Bot is in use and that their messages and activity may be processed by the Bot.
- Publish a contact channel (for example, a Discord user tag, email address, or support server) so users of your instance can reach you with privacy requests, deletion requests, and reports of bot misbehavior. The Bot enforces this requirement: it will refuse to start unless `OPERATOR_AGREEMENT=true` and `OPERATOR_CONTACT` are set in your `.env` file. Users can view your published contact via the `/operator-contact` slash command.
- Provide users of your instance with a way to report issues or violations relating to the Bot or its use, and review such reports and take appropriate action.
- Configure the Bot's features, including moderation, logging, analytics, and third-party integrations, in a manner consistent with your community's expectations and applicable law.
- Honor the rights of your server members, including rights of access, correction, and deletion where required by applicable law.
- Refrain from using the Bot to violate the privacy, safety, or rights of any person.

## 5. Prohibited Use

You may not use the Bot to:

- Violate any applicable law or regulation.
- Violate Discord's Terms of Service, Developer Policy, or Community Guidelines.
- Direct the Bot at, or process data of, users under the age of 13 or the minimum age required by the laws of their applicable countries.
- Process data for which you lack a lawful basis.
- Harass, defame, or harm any person.
- Send unsolicited messages, spam, or promotional content.
- Distribute malware, phishing content, or other harmful material.
- Attempt to reverse-engineer, decompile, or otherwise extract source code from any proprietary component integrated with the Bot, except as permitted by the GPLv3 or applicable law.
- Circumvent rate limits, security controls, or access controls imposed by Discord or by third-party services integrated with the Bot.

## 6. Third-Party Services

The Bot can be configured to interact with third-party services. When you enable these integrations, you are responsible for your use of those services and for complying with their terms. The Bot may interact with the following third-party services depending on your configuration:

- Discord (https://discord.com/terms)
- OpenAI Moderation API (https://openai.com/policies/row-privacy-policy) — when `OPENAI_API_KEY` is set, message content is sent to OpenAI for moderation scoring.
- Argos Translate (https://translate.argosopentech.com) — when translation is enabled, message content is sent to the configured translation endpoint.
- Twitch (https://www.twitch.tv/p/legal/terms-of-service/) — when Twitch integration is enabled, the Bot polls Twitch for stream status using your Twitch client credentials.
- YouTube (https://www.youtube.com/static?template=terms) — when YouTube integration is enabled, the Bot queries YouTube for video metadata using your YouTube API key.
- GitHub (https://docs.github.com/en/site-policy/github-terms/github-terms-of-service) — when GitHub webhooks are enabled, the Bot receives webhook payloads from GitHub on a local HTTP server.
- Peer bots via the Interlink plugin — when Interlink is enabled, the Bot exchanges events with peer bots you have registered, using bearer-token-authenticated HTTPS requests.

The authors of the Bot are not responsible for the practices of these third-party services. Your use of each service is governed by that service's own terms and privacy policy.

## 7. No Warranty

THE BOT IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NONINFRINGEMENT, AND ACCURACY. THE AUTHORS DO NOT WARRANT THAT THE BOT WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR FREE OF HARMFUL COMPONENTS.

## 8. Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT WILL THE AUTHORS, CONTRIBUTORS, OR COPYRIGHT HOLDERS OF THE BOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF DATA, LOSS OF PROFITS, LOSS OF GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF, OR INABILITY TO USE, THE BOT, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

## 9. Indemnification

You agree to indemnify and hold harmless the authors, contributors, and copyright holders of the Bot from and against any claims, damages, obligations, losses, liabilities, costs, or expenses (including reasonable attorneys' fees) arising out of or related to your use of the Bot, your violation of these Terms, or your violation of any applicable law or third-party right.

## 10. Termination

These Terms remain in effect for as long as you use the Bot. You may terminate these Terms at any time by stopping the Bot and removing it from your Discord servers. The authors may, at their discretion, cease to maintain the Bot or any version of it, without liability to you.

## 11. Modifications

The authors may update these Terms from time to time. Material changes will be reflected by updating the "Last updated" date at the top of this document. Your continued use of the Bot after a change constitutes acceptance of the updated Terms.

## 12. Governing Law

These Terms are governed by the laws of the United States, without regard to its conflict-of-law principles. Any dispute arising out of or relating to these Terms will be resolved in the courts of competent jurisdiction in the United States, unless applicable law requires otherwise.

## 13. Contact

For questions about these Terms, contact the operator of the self-hosted instance you are using. If you are the operator and have questions about the upstream project, open an issue at the project's public repository.

Upstream author contact (for project questions only): Mitchell Sehenuk — mgs008@outlook.com. This address is not a contact channel for users of arbitrary self-hosted instances; each instance operator must publish their own contact information.
