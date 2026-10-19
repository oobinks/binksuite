# BinkSuite — Etsy Seller Policy Compliance Notes

Source: Etsy Seller Policy (etsy.com/legal/sellers), last updated 05 Oct 2026. Captured 19 Oct 2026.
Use this file as the compliance rulebook for BinkSuite rooms and agents. Re-check the policy whenever Etsy updates it.

## 1. Listing rules (most important for AI digital products)

- [ ] Disclose AI in every listing where an item is created using AI. **Mandatory.**
- [ ] Everything sold must be made, designed, handpicked or sourced by the seller. Check Etsy's Creativity Standards for what counts.
- [ ] Describe accurately how the item was made, by whom, and where it's sent from.
- [ ] The About section must accurately list everyone involved in making items or running the shop.
- [ ] Production partners (if any) must be disclosed in the relevant listings.
- [ ] Listing images must be your own: no stock photos, other sellers' photos, or photos from other sites. Check Etsy's listing image requirements for how this applies to digital mockups.
- [ ] Every listing must offer a real item for sale. Digital items count.
- [ ] Item details must be accurate (attributes, components, materials, origin).

## 2. Not allowed

- Prohibited items, and anything that infringes intellectual property (trademarks, characters, brands, other people's art). This is a big risk with AI-generated designs.
- Listings with no product (referral codes, want ads, crowdfunding).
- Shop gift cards. Only Etsy sells gift cards.
- Dropshipping and reselling (apart from narrow exceptions like craft supplies).
- Duplicate shops, or faking clicks, carts, sales or reviews to game search.
- Coordinating prices with other sellers.
- Off-platform sales. Never steer buyers to pay outside Etsy, in listings or in messages.
- Extra payment after checkout must go through Etsy's "Create Custom Order" feature.

**Consequences:** listings removed (listing fees aren't refunded), and the account can be limited, restricted or suspended. Outstanding fees are still owed.

## 3. Content rules (listings, messages, photos, text)

No content that is:

- hateful or discriminatory
- threatening, harassing or interfering with other sellers
- infringing someone else's IP
- false, deceptive or misleading
- spam or unsolicited ads
- private information (yours or anyone else's)
- pushing off-platform transactions
- making prohibited medical claims
- sexualising minors
- otherwise listed in the Prohibited Items Policy

## 4. Customer service standards

- [ ] Honour your processing/delivery times. For digital items this means instant or prompt delivery.
- [ ] Reply to messages quickly.
- [ ] Honour your shop policies. Fill them in fully, including a digital items policy.
- [ ] Sort out issues directly with buyers first. You have 48 hours after a buyer reports a problem before they can open a case.
- [ ] If you can't fulfil an order: message the buyer, cancel it, and give a full refund if they've paid. Keep proof of refunds.
- [ ] Honest pricing and promotions. Sales and "was/now" prices must be real and must not mislead about the value or timing.
- You're responsible for following all laws that apply to your products, including labels and warnings.

## 5. Buyer data and privacy (UK GDPR)

- You are an independent data controller for buyer data you receive (name, email, address).
- Use buyer info only for Etsy-related communication and orders.
- Never add buyers to a mailing list, use them in marketing, or store their payment info without consent.
- You may need your own privacy policy, visible to buyers.
- You must handle data requests (access, correction, deletion and similar).
- You're responsible for any data leak, including through the Etsy API, which also falls under the Etsy API Terms of Use.
- **App impact:** BinkSuite agents and the database must store as little buyer data as possible, keep it secure, and never use it for marketing without consent.

## 6. Messages

Never use Messages for:

- spam or promotions
- harassment
- contacting someone who has asked you to stop
- interfering with other sellers
- off-platform deals

Interference is banned. That includes warning buyers away from competitors, posting about disputes in public, buying just to leave a bad review, click fraud on competitors' ads, and upvoting competitors' bad reviews.

## 7. Reviews

- Buyers of digital items can review for 100 days from first download, or up to 12 months after purchase (whichever comes first).
- You can reply to reviews. Replies must follow the content rules: nothing obscene, nothing blaming the courier/Etsy/third parties.
- No shilling or fake reviews.

## 8. Refunds and withdrawal rights

- UK and EU buyers may have a 14-day right of withdrawal. Rights for digital items vary, so check the UK rules for digital content. Digital downloads usually need the buyer's consent to immediate delivery before the right to cancel is lost.
- Know the consumer laws of your own country and your buyers' countries.

## 9. Account risk

- Etsy may limit visibility, hold payments in reserve, or suspend the account for unusual order spikes, poor service, or fraud/dispute risk.
- A sudden spike in orders can lower search visibility.
- Etsy may require onboarding/identity verification at any time.
- Etsy can suspend related accounts too.

## 10. Fees

There are fees for listing, selling, advertising and some features. See the Fees & Payments Policy. Build these into BinkSuite's profit tracking.

## Suggested BinkSuite agent guardrails

1. **Listing agent:** automatically adds an AI-disclosure line to every listing and runs an IP check (no brands, characters, celebrities or copyrighted styles) before publishing.
2. **Image agent:** uses only your own generated mockups. No stock photos or images scraped from elsewhere.
3. **Pricing agent:** only real discounts. No fake "was" prices.
4. **Messages agent:** no off-platform links or payment requests, no marketing messages, and replies within 24h. Flag any issue reported by a buyer so it's handled inside the 48h window.
5. **Data:** keep buyer data to a minimum, store it securely, and never export it to marketing tools.
6. **Reviews:** never generate or request fake reviews.
7. **Shops:** one shop only (BinkSuite). Don't run duplicate shops.

---

## Where BinkSuite stands today (v0.7.0)

Checked against the code on 19 Oct 2026. ✅ = handled by the app · 🟡 = partly · 👤 = your job on Etsy · ➖ = not applicable.

| Rule | Status | How |
| --- | --- | --- |
| AI disclosure in every listing | ✅ | The Copywriter puts an AI line first in every description, and the Compliance Office blocks launch without one (`src/shared/compliance.ts`, `ai-disclosure` check). |
| "Designed by" = you | ✅ | A hard check in the Compliance Office. |
| No brands, characters or celebrities | 🟡 | A hard blocklist check, which you can edit in Settings. It only catches names on the list, not "in the style of" an artist, so read every design too. |
| Own images, no stock or scraped photos | ✅ | Art and mockups come from the AI and the in-browser Printer. Nothing is downloaded from other sites. You approve the art and mockups before they move on. |
| No auto-publishing | ✅ | BinkSuite never posts to Etsy. You upload every listing yourself. |
| No coordinating prices | ✅ | Trend Radar and Price Watch only read public listing prices through the official API. They set your price on their own and never contact other sellers. |
| No fake "was/now" prices | ✅ | The app never creates sales or discounts. The Pricer only suggests a single price. |
| Fees in profit tracking | ✅ | Listing, transaction, payment processing and VAT on fees are in every price and in the Finance Vault. |
| Buyer data (UK GDPR) | ✅ | BinkSuite stores no buyer names, emails or addresses. Recorded sales are only amounts. The Etsy key is read-only for public listings and is encrypted in the Key Vault. |
| Spreadsheets: no financial advice or tax maths | ✅ | 📊 EXCEL products never calculate tax, National Insurance, pensions or interest; buyers type their own take-home figures. The Copywriter is told not to promise financial results. Every formula is checked before a file is built. |
| Messages | ➖ | BinkSuite never messages buyers. If a Messages helper is added, it must follow section 6 and the guardrail above. |
| Reviews | ✅ | The app never writes or asks for reviews. |
| One shop | 👤 | The app is built for one shop. |
| About section, shop policies, digital items policy | 👤 | Fill these in on Etsy. |
| 14-day withdrawal and digital download consent | 👤 | Set this in your Etsy shop policies. The listing text could mention instant download. Not built yet. |
| Fast replies and the 48h problem window | 👤 | Check Etsy Messages daily. |

## Bundles and "save X%" (added v0.13.0)

- A bundle's saving is worked out from the prices its products are **really on sale for separately**, at the moment the Launch Pad pack is made, never from an invented "was" price.
- BinkSuite won't let a bundle cost the same as, or more than, its products bought separately.
- **Keep the separate listings live at those prices** while the bundle is on sale. If you change or remove one, update the bundle's "Better value" line too, so the claim stays true (UK consumer law on price comparisons).
