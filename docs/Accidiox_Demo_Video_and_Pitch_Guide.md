# Accidiox — Demo Video & Pitch Guide

KAYA Buildathon, IIT (BHU) Varanasi · Prepared 23 September 2026

This guide covers five things: how to fill the submission form, how to
structure the rest of the demo video, the lines that win judges over, who
actually pays for Accidiox, and an honest list of strengths, limits and
future scope so no question catches you off guard.

> Say the product name slowly the first time: **Ac-ci-di-ox** (Accident +
> Dios). Judges must be able to search it later.

---

## 1. Filling the submission form

**GitHub / source URL**
`https://github.com/Nykz/Accidiox`
Make the repository public before you submit, and check the link in a private
browser window. A 404 on the judges' screen costs you the code marks.

**Live demo URL (website)**
`https://accidiox.codingtechnyks.com`
This opens the rider app. Put the other three links in your README and say
them in the video, because the form has only one field:

- Hospital console — `https://accidiox.codingtechnyks.com/hospital_dashboard.html`
- Ambulance crew app — `https://accidiox.codingtechnyks.com/ambulance.html`
- Owner console — `https://accidiox.codingtechnyks.com/admin.html`

**Video / presentation URL**
Upload to YouTube as **Unlisted**, not Private. Private links fail for
judges. Title it `Accidiox — AI Two-Wheeler Crash Black Box | KAYA
Buildathon 2026`. Turn comments off, and do not schedule it.

**Deck (PDF/PPT, max 20 MB)**
Export your deck to **PDF** so fonts can't break on their machine. Name the
file `Accidiox_KAYA_2026_Deck.pdf`.

**Before you submit, check these**

1. The live site opens on mobile data, not only on your Wi-Fi.
2. A judge who signs up as a hospital sees the "waiting for verification"
   screen, which shows the approval system works.
3. The README's first screen answers: what it is, who it's for, and how to
   try it.
4. Test accounts: give the judges one rider login and one hospital login in
   the README, on a separate demo hospital, never your real GNRC account.

---

## 2. The video, part by part

Target length: **6 to 7 minutes**; aim to finish at **6:30** so you have
slack. You have already shot Part 1 and Part 2.

A longer video is not permission to talk more. It is permission to let the
demo breathe: the crash, the hospital screen and the crew phone in real time,
uncut. Judges watch a lot of videos — the ones that win are the ones where
something real happens on screen.

**Part 1 · The problem — 0:00 to 0:50 (done)**
Keep it to three facts and one human line. Ending suggestion, if you re-record:
"The crash is not what kills most riders. The wait does."

**Part 2 · The product — 0:50 to 1:10 (done)**
One sentence of what it is, said plainly:
"Accidiox is a black box for two-wheelers. It detects the crash, and it
brings the ambulance — automatically."

**Part 3 · The hardware — 1:10 to 2:00**
Show the device in your hand, then mounted on the bike, then the wiring.
Say: "An ESP32 with an MPU-6050 sensor sits under the seat. It reads the
bike's angle 100 times a second and talks to the rider's phone over
Bluetooth. Parts cost under ₹1,200, and it fits any bike, not just a new one."
Show the rider app's live screen: speed, lean angle, connection status. With
the extra time, name the detection rule out loud: "A tilt has to hold for ten
straight seconds before we believe it's a crash."

**Part 4 · The crash demo — 2:00 to 3:20 · this is the film**
Shoot it in one unbroken take if you can. Judges trust one long take far more
than five cuts. With 6–7 minutes you can afford to run the full 20-second
countdown in real time instead of cutting it — do that, it is the most
convincing 20 seconds in the video.

1. Bike upright, app showing live data. Drop the bike.
2. The phone screen: the 20-second countdown, the siren, "I'm safe" button.
3. Let it run to zero. Do not touch the screen. Say nothing for those
   seconds — the silence sells it.
4. Cut to the family member's phone: WhatsApp message with the live location
   arriving, and the phone ringing with the automatic voice call.

**Part 5 · The rescue chain — 3:20 to 4:40**
Have the hospital console open on a laptop beside you, already signed in.

1. The new emergency appears on the hospital console with the patient's name,
   blood group and allergies, plus distance and ETA.
2. Click **Accept**, choose an ambulance. Say: "The first hospital to accept
   wins the case. The others are locked out, so no two ambulances race to the
   same crash."
3. Switch to the crew phone: it rings, shows the 60-second accept timer.
   Accept it. Say: "If the crew doesn't accept in 60 seconds, the hospital
   picks another unit. If no crew accepts in 5 minutes, the case goes back to
   the next nearest hospitals."
4. Back to the rider's phone: "Help is on the way", the ambulance moving on
   the map, and the ETA counting down.

**Part 6 · The safety valves — 4:40 to 5:20**
This is where you show judgement, not just code.

- The rider taps "I'm safe" and answers two questions. The ambulance is freed
  in the same second.
- If the rider is hurt and untreated, the app refuses to cancel. Say that out
  loud; judges remember it.
- The owner console: if a rider never responds, your support team calls them,
  and marks the case closed everywhere — it disappears from the hospital and
  crew screens while you watch.

**Part 7 · Who pays — 5:20 to 6:00**
One slide, four lines, no more. Details are in section 5 of this guide.
Say: "Hospitals never pay — they're the supply side, and the console is free
forever. Riders buy the box for about two thousand rupees. Delivery fleets
buy it by the hundred, because a rider down is their liability. And once
we're carrying verified crash data, insurers pay for it."

**Part 8 · Future scope — 6:00 to 6:20**
Exactly three: the phone-free 4G box, crash severity so the hospital knows
whether to send basic or advanced life support, and the hospital network city
by city. Ten ideas sounds like you haven't chosen one.

**Part 9 · Close — 6:20 to 6:30**
"Accidiox is live today at accidiox.codingtechnyks.com, with four apps,
working hardware, and a signed APK. We are not asking what if. We are asking
which hospital signs up first."

**Answering your question — explain during, or after?**
Explain **during** the demo, in one line per screen, then stop talking. A
separate explanation block after the demo makes the video drag, even at seven
minutes. What belongs after the demo is only this: who pays, what's next, and
the close.

---

## 3. Recording notes that raise the score

- Record the phone screen with Android's built-in screen recorder, not a
  camera pointed at the phone. Film the bike with the camera.
- Do a silent run first with mobile data on both phones. Kill Wi-Fi so judges
  see it works in the field.
- Keep a stopwatch visible in the crash shot if you can; it proves how fast
  the chain is.
- Put one line of text on screen each time a new app appears: "Rider app",
  "Hospital console", "Ambulance crew app".
- Speak 15 percent slower than feels natural. Every good demo is ruined by
  speed.
- If a live call may fail on stage, record the successful run and use it. Say
  "recorded run" on screen. Judges forgive that; they do not forgive a fake.

---

## 4. Winning lines

Use these as they are.

**The one-liner**
"Accidiox turns a fallen bike into a dispatched ambulance, without anyone
making a call."

**On the gap**
"Cars have had automatic crash response for twenty years. In India, 45 out of
every 100 road deaths are two-wheeler riders, and they have nothing."

**On what makes it different**
"Everyone else notifies a family member. We notify the hospital that has the
ambulance — and we make sure someone actually accepts the case."

**On the golden hour**
"We don't shorten the surgery. We shorten the silence before it."

**On trust**
"Every automatic system fails the day it cries wolf. So the rider can cancel
in one tap, the crew must accept in 60 seconds, and a human support team can
close a case the rider never answered."

**On being real, not a mock-up**
"This isn't a prototype in a folder. It's a live site, three installable
Android apps, a signed APK, and hardware on a real bike."

---

## 5. Who pays — the business model

The question judges always ask is "who actually buys this?" The answer that
works is: **hospitals never pay, riders and fleets buy the box, insurers pay
for the data later.** Here is why, and in what order.

**The rule that makes it work**

Accidiox is a two-sided network: riders on one side, hospitals with
ambulances on the other. You must never charge the side you are short of.
You are short of hospitals. So the hospital console is free, forever, and
you say that sentence out loud in the pitch.

**Buyer 1 · Delivery fleets — start here**

Swiggy, Zomato, Zepto, Blinkit, Amazon and every local logistics company run
thousands of two-wheelers all day. A rider down is their operational and
legal problem, and they already pay for insurance on those riders.

- They buy in hundreds, so one signature equals a thousand devices.
- They have a safety budget already, and a compliance reason to spend it.
- They give you dense city coverage fast, which is what makes the hospital
  side worth joining.
- Pitch to them as fleet safety, not charity: fewer rider-down incidents that
  turn into disputes, and a dashboard of where their riders crash.

Price it as a device plus a per-rider monthly fee. Indicative, to be
validated: about **₹2,000 per device** and **₹40 to ₹60 per rider per
month**. Present those as your working numbers, not as proven ones.

**Buyer 2 · Individual riders**

Sold through bike accessory shops, service centres and online. One-time
**₹1,999 to ₹2,499** for the box, with the app free for the first year and
about **₹499 a year** after that, which covers the WhatsApp, call and map
costs per alert.

Be realistic in the pitch: individual sales are slow and marketing-heavy.
They matter for the story and for the network's edges, but fleets are what
pay the bills in year one.

**Buyer 3 · Insurance companies — the real long-term revenue**

Motor insurers lose money on fraudulent and inflated two-wheeler claims, and
they have no ground truth about what happened. Accidiox has the one thing
they can't buy: **verified crash telemetry with a timestamp, a location and a
hospital record.**

- Sell verified crash reports per claim, or a data subscription.
- Co-sell the device: an insurer bundles Accidiox with a policy and offers a
  premium discount to riders who fit one, the way car telematics discounts
  already work abroad.
- This is a year-two conversation. Say "later" in the pitch. Judges punish
  founders who promise insurance deals they haven't started.

**Buyer 4 · Bike makers and dealers**

An accessory a dealer fits at delivery, or a factory-fit option on commuter
bikes. Highest volume, slowest to close, so treat it as the year-three door,
not the plan.

**Who never pays**

- **Hospitals.** Free console, free crew app, free forever. They bring
  ambulances and they bring patients; that is their contribution.
- **The rider's family.** Nothing, ever. They are the person receiving the
  worst call of their life.

**What it costs you to run**

Each alert sends a WhatsApp message, one automatic voice call, an email and
some map lookups — paise per alert on today's rates, not rupees, and a crash
is a rare event per rider. Verify the exact per-message rates with Twilio and
Meta before you put a number on a slide. Hosting is a shared PHP/MySQL plan.
The honest summary: the running cost per rider per year is small compared to
a ₹499 subscription, and the device is sold near cost to get volume.

**Say this in the pitch**

"We don't sell software to hospitals. We give it to them, because they bring
the ambulances. We sell the box to riders and to the delivery fleets who
can't afford a rider to go missing — and once we're carrying verified crash
data, insurers pay for that too."

**Your first three business steps after the hackathon**

1. One signed pilot hospital in Guwahati, free, with the console live.
2. One local delivery fleet, 50 devices, three months, measured.
3. One insurer conversation, listening only, no promises.

---

## 6. The gap you are filling

Be precise here; judges test this question.

**What already exists**

- **108 ambulance service** — works well, but somebody conscious has to call,
  describe the location, and wait on the line.
- **Apple / Google crash detection** — detects the crash on the phone, then
  calls emergency services. No patient medical data, no hospital dispatch, no
  confirmation that anyone accepted.
- **Car telematics (OnStar, Bosch eCall)** — the full chain, but only in cars,
  and effectively absent from Indian two-wheelers.
- **Premium bike systems (KTM MY RIDE, Garmin)** — crash alerts to contacts
  only, on bikes costing several lakh rupees.

**What nobody does, and Accidiox does**

1. Connects the crash directly to the **hospital's dispatch desk**, not just
   to a family member.
2. Sends the **patient's medical profile** — blood group, allergies,
   conditions — ahead of the ambulance.
3. Guarantees **someone accepted**: first hospital to claim, 60-second crew
   accept, automatic hand-back if nobody responds.
4. Closes the loop with a **human support console**, so false alarms don't
   burn ambulances.
5. Runs on a **₹1,200 add-on box** that fits any existing two-wheeler, not
   only new premium bikes.

Say this sentence: "We are not building a crash sensor. We are building the
dispatch network that the sensor plugs into."

---

## 7. Strengths — say these

- **End-to-end and live.** Hardware, rider app, hospital console, crew app,
  owner console, all deployed and working together today.
- **Built for a panicking user.** 20-second cancel window, one-tap "I'm safe",
  large buttons, works on a cheap Android phone.
- **Designed for hospitals, not for a demo.** Verification before any patient
  data is shared, bed counts, fleet management, crew approval.
- **Fails safe.** No hospital accepts → alert goes wider. Crew silent →
  another unit. Rider hurt → cancellation refused.
- **Cheap and retrofittable.** Under ₹1,200 of parts, fits any bike from a
  ₹60,000 commuter upward.
- **Private by design.** Medical details go only to the verified hospital that
  accepted, and only after a confirmed crash.
- **Multi-channel alerting.** WhatsApp, automatic voice call, email to the
  hospital, plus the live dashboard. One channel failing doesn't end the
  rescue.

---

## 8. Honest limits — and how to answer them

Never hide these. Say the limit, then the answer, in the same breath.

**"It needs the rider's phone."**
True for the current version. The phone carries GPS and internet. We have a
second firmware variant with onboard 4G and GPS, so the box works even if the
phone is dead or thrown clear; that's the next build.

**"How do you know it's a real crash and not a parked bike falling?"**
A tilt beyond the threshold has to hold for 10 continuous seconds, then the
rider gets 20 seconds to cancel, then a human at our support desk can close a
case. Three filters, and only the last one costs anyone anything.

**"Have you tested accuracy?"**
Be honest: tested on controlled drops of a real two-wheeler, not on a
statistically significant crash dataset. Say what you plan: instrumented
drops at several angles and speeds, and a logged field trial with 20 riders.
Judges respect a measured plan far more than an invented number.

**"What if there are no hospitals on Accidiox in that city?"**
Then the family still gets WhatsApp and a voice call with the location, and
the rider still sees 108 and 112. The hospital layer is the upgrade, not the
only path.

**"Isn't this a lot of patient data?"**
Only blood group, allergies, conditions and an emergency contact, shared only
with a verified hospital, only after a confirmed crash, and deleted-on-demand
with the account.

**"Will hospitals actually use it?"**
That's the honest business risk. The console is free for hospitals, takes two
minutes to sign up, and brings them patients. Our next step is a signed pilot
with one hospital in Guwahati.

**Other limits worth owning:** SMS and voice calls run on a trial account
today, so production needs a paid telephony plan; no offline mesh if the
rider has no mobile network at all; and the accuracy of the nearest-hospital
list depends on map data quality in smaller towns.

---

## 9. Future scope

Say three, not ten. Ten sounds like you haven't chosen.

1. **Phone-free box** — the 4G + GPS variant already in the repo, so the black
   box alerts hospitals by itself.
2. **Crash severity, not just crash detection** — use impact force, speed
   drop and rotation to tell the hospital whether to send a basic or an
   advanced life-support unit.
3. **Hospital network, city by city** — start with a pilot in Guwahati, then
   open the console to any verified hospital, the way ride-hailing onboarded
   drivers.

If asked for a business model: the rider device is sold at cost, hospitals
use the console free, and revenue comes later from insurance partners who pay
for verified crash data and faster claims. Say "later"; do not oversell it.

---

## 10. Likely judge questions

- **"What's yours and what's a library?"** Yours: the detection algorithm,
  the entire dispatch protocol, three apps, the backend. Libraries: Leaflet
  for maps, Geoapify for geocoding, Twilio and Meta for messaging.
- **"How is this different from a panic button?"** A panic button needs a
  conscious hand. The entire point of Accidiox is the rider who can't move.
- **"Why not an app-only solution?"** Phones in pockets throw false positives
  and miss real crashes; the sensor is bolted to the frame, which is what
  actually crashes.
- **"What happens on a false alarm?"** Show the cancel flow, then the owner
  console. This answer has already been built; make sure you show it.
- **"Who pays, and who never pays?"** Hospitals never pay. Riders and
  delivery fleets buy the box; insurers pay for verified crash data later.
  Section 5 has the numbers.
- **"What did you build during the hackathon versus before?"** Answer
  plainly. Judges check GitHub commit dates.
- **"Who's on the team and who did what?"** Have a one-line answer per
  person, ready.

---

## 11. Do and don't

**Do**

- Show a real bike falling. It is the single strongest thing you have.
- Say numbers you can defend, and name the source (MoRTH road accident
  report) for any statistic you use.
- Name the limits before the judges find them.
- End with the ask: a pilot hospital, or a mentor in emergency medicine.

**Don't**

- Don't claim AI you didn't build. Call it what it is: a gravity-vector
  algorithm with a hold window. "Honest engineering" scores higher than
  "AI-powered" in a room of engineers.
- Don't demo live on conference Wi-Fi without a recorded backup.
- Don't show your own real hospital admin account or any real patient data.
- Don't use a stat you can't cite.
- Don't run past the time limit. A video cut off at 4:00 loses your close.
