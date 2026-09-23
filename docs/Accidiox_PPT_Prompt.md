# Prompt for generating the Accidiox pitch deck

Paste everything between the two lines below into any AI presentation tool
(Gamma, Canva Magic, Copilot in PowerPoint, Claude, ChatGPT, Beautiful.ai).
It is written so the tool builds the deck exactly, without inventing facts.

If the tool asks for a file format, ask for **16:9 PowerPoint (.pptx)**, then
export to PDF for submission.

---

You are a senior presentation designer. Build me a 16-slide pitch deck in
16:9 for a hardware startup called **Accidiox**, for the KAYA Buildathon at
IIT (BHU) Varanasi. Output a PowerPoint (.pptx) file.

## The single most important instruction

This deck is **visual, not textual**. A person with no technical background
must understand the whole story by looking at the pictures alone, with the
sound off. Text exists only to name what the picture already shows.

Hard rules, applied to every slide:

- **Maximum 25 words of visible text per slide**, including the headline.
- **One idea per slide.** If a slide needs "and", split it.
- **Never write a paragraph.** No sentence longer than 12 words.
- **No bullet list longer than 3 items**, and each item maximum 6 words.
- **Every slide carries one dominant visual**: a photo, a product screenshot,
  a diagram, or one huge number. The visual takes at least 50% of the slide.
- **Never put a wall of data on a slide.** Any number that matters becomes a
  single huge figure, not a table or a chart with many series.
- Anything that needs more explanation goes in the **speaker notes**, not on
  the slide. Write full speaker notes for every slide.

## Visual identity

- **Palette:** near-black ink `#14161a` for text; emergency red `#dc2626` as
  the single accent (use it sparingly, for one element per slide); white
  `#ffffff` and light grey `#f5f6f8` backgrounds; green `#16a34a` only for
  "safe / resolved" moments; blue `#2563eb` only for map or data elements.
- **Typography:** one clean sans-serif family throughout (Inter, Poppins or
  Montserrat). Headlines 40–54 pt and bold. Supporting line 18–22 pt in grey.
  Never use more than two sizes on one slide.
- **Layout:** generous white space, a consistent left margin on every slide,
  and content vertically centred. Photo slides are full-bleed with a dark
  gradient behind the text so it stays readable.
- **Icons:** thin-line outline icons only, one weight, one colour. Never use
  emoji. Never use clip art. Never use 3D shiny icons.
- **Charts:** at most one chart in the entire deck, and only if it has a
  single comparison. No pie charts, no 3D charts, no gridlines.
- **Photos:** real photographs of Indian roads, two-wheelers and hospitals.
  Never stock photos of Western businesspeople shaking hands. Never a photo
  with visible graphic blood or an identifiable injured person's face.
- Keep the same footer on every slide except the title: small grey
  "Accidiox · KAYA Buildathon 2026" bottom left, slide number bottom right.

## Facts you may use — and nothing else

Use only these facts. **Do not invent any statistic, price, customer, award
or partnership.** If a slide seems to need a number that is not in this list,
leave the number out and use a picture instead.

- India records roughly 1.7 lakh road deaths a year, and about 45 out of
  every 100 of those are two-wheeler riders. Source: MoRTH road accident
  report. Label it as such on the slide.
- The "golden hour" is the first hour after a crash, when medical help
  decides whether someone lives.
- Accidiox hardware: an ESP32 microcontroller with an MPU-6050 6-axis motion
  sensor, mounted under the seat, connected to the rider's phone by Bluetooth
  Low Energy. Parts cost under ₹1,200. It fits any existing two-wheeler.
- Crash detection: the bike's tilt must stay past the threshold for **10
  continuous seconds**, then the rider gets **20 seconds** to cancel with one
  tap before anything is sent.
- When the countdown ends, the system automatically: sends WhatsApp with a
  live location to the rider's family, places an automatic voice call to
  them, emails the alerted hospitals, and shows the crash on the dispatch
  console of the **3 nearest verified hospitals**.
- Dispatch rules: the **first hospital to accept** owns the case and the
  others are locked out; the ambulance crew must **accept within 60 seconds**
  or the hospital picks another unit; if no crew accepts within **5 minutes**
  the case returns to the other nearby hospitals.
- The rider sees "help is on the way" with the ambulance moving on a live map
  and an ETA.
- Safety valves: one tap cancels the ambulance; a rider who reports being
  hurt and untreated is **not** allowed to cancel; an Accidiox support team
  can phone a rider who never answered and close the case from an owner
  console, which clears it from every app at once.
- Four working apps, all live today: rider app, hospital console, ambulance
  crew app, owner console. The rider and crew apps install on Android.
- Live at accidiox.codingtechnyks.com. Source code on GitHub.
- Business model: the hospital console is free forever; riders buy the device
  for roughly ₹2,000; delivery fleets buy in bulk with a small monthly fee
  per rider; insurers pay later for verified crash data. Mark pricing as
  indicative.
- Honest status: working prototype tested on controlled drops of a real
  two-wheeler, not on a large crash dataset. The current version needs the
  rider's phone; a phone-free 4G version is built but not field-tested.

## The 16 slides

Build exactly these, in this order. The quoted text is the **only** text that
appears on the slide. Follow each visual instruction.

**Slide 1 — Title**
Text: "Accidiox" / "The black box that brings the ambulance"
Visual: full-bleed dark photo of a two-wheeler on an Indian road at dusk.
Small line at the bottom: "KAYA Buildathon 2026 · IIT (BHU) Varanasi".

**Slide 2 — The scale**
Text: one huge number "45 of every 100" and under it "road deaths in India
are two-wheeler riders".
Visual: the number fills the slide. Tiny grey source line: "MoRTH road
accident report".

**Slide 3 — The real killer**
Text: "The crash is not what kills most riders." / "The wait does."
Visual: full-bleed photo of an empty road with one fallen bike, shot from a
distance so it feels lonely. No text beyond those two lines.

**Slide 4 — What happens today**
Text: three short steps: "Nobody sees the crash" → "Nobody knows who to call"
→ "Nobody brings the blood group".
Visual: three grey outline icons in a row, connected by a thin line, with a
red X over the chain. Maximum 6 words per step.

**Slide 5 — Meet Accidiox**
Text: "A crash calls the hospital. Automatically."
Visual: the product hero — the device beside a phone showing the rider app.
Nothing else on the slide.

**Slide 6 — The box**
Text: "Under ₹1,200. Fits any bike."
Visual: a clean photo of the hardware with three thin callout lines labelling
only: "ESP32", "MPU-6050 motion sensor", "Bluetooth to the rider's phone".

**Slide 7 — How it works**
Text: headline "Ten seconds to detect. Twenty to cancel. Then everything
happens at once."
Visual: **one horizontal flow diagram**, five nodes, left to right, thin line
style: bike falls → phone detects → 20-second countdown → alerts fan out →
ambulance dispatched. The fan-out node branches to four small icons:
WhatsApp, phone call, hospital console, email. No other text.

**Slide 8 — Why it does not cry wolf**
Text: "10 seconds of tilt. 20 seconds to say I'm safe."
Visual: a large circular countdown timer graphic showing 20, with a green
"I'm safe" button beside it. This slide is about trust; keep it calm and
almost empty.

**Slide 9 — The rider's phone**
Text: "The rider does nothing. That's the point."
Visual: a phone mockup showing the rider app's crash screen, full height,
right half of the slide. Use the screenshot I provide.

**Slide 10 — The hospital sees everything**
Text: "Blood group, allergies, location — before the ambulance leaves."
Visual: the hospital console screenshot in a laptop frame, as large as
possible. Highlight one detail with a thin red circle: the patient's blood
group. This is the most important slide in the deck; give it the most space.

**Slide 11 — The crew accepts in 60 seconds**
Text: "If they don't, another ambulance goes."
Visual: phone mockup of the ambulance crew app showing the accept timer, with
a small red 60-second ring graphic beside it.

**Slide 12 — When it's a false alarm**
Text: "One tap cancels. Unless the rider says they're hurt."
Visual: a simple two-path diagram: green path "rider is safe → ambulance
freed", red path "rider is hurt → help keeps coming". Include a small third
line: "Our support team closes cases nobody answered."

**Slide 13 — What nobody else does**
Text: a 4-row comparison, 3 words per cell maximum. Rows: "Detects crash",
"Alerts family", "Alerts hospital", "Confirms someone accepted". Columns:
"Phone apps", "Premium bikes", "Accidiox". Use tick and dash marks only, no
sentences. Accidiox column highlighted in red.
Visual: keep the table minimal — no borders, lots of space.

**Slide 14 — Who pays**
Text: three short lines: "Hospitals: free forever", "Riders: ~₹2,000 device",
"Fleets and insurers: the revenue".
Visual: three simple icons — a hospital, a rider, a delivery scooter. Small
grey line: "Pricing indicative".

**Slide 15 — What's next**
Text: three items, 5 words each: "Phone-free 4G box", "Crash severity for
triage", "Hospital network, city by city".
Visual: a light horizontal timeline, three markers, no dates.

**Slide 16 — Live today**
Text: "accidiox.codingtechnyks.com" / "Four apps. Real hardware. Working
now." / "Looking for our first pilot hospital."
Visual: a clean grid of the four app screens, small, side by side. Add a QR
code placeholder pointing to the live site.

## Images I will supply

Leave a clearly marked image placeholder on any slide where you don't have my
file, sized and positioned correctly, so I can drop my own picture in. I have:
rider app screens, hospital console screens, owner console screens, photos of
real bike accidents, and a demo video. Never generate a fake screenshot of my
product — use a placeholder instead.

## What will make me reject the deck

- Paragraphs of text, or any slide that reads like a document.
- Invented statistics, fake logos, fake partner names, fake testimonials.
- Emoji, clip art, drop shadows, gradients on text, or more than one accent
  colour.
- A slide that needs me to talk for two minutes before it makes sense.
- Dense tables, dashboards full of numbers, or charts with many series.
- Generic stock photos of people in suits.

## Final check before you finish

Go through your own deck and answer, for each slide: "If someone saw only
this picture for three seconds, would they get the point?" If the answer is
no, replace the text with a better visual. Then give me the speaker notes for
all 16 slides in a separate list.

---

## After the AI gives you the deck

1. Replace every placeholder with your real screenshots. Your own product
   screens are the strongest images you have.
2. Check each slide at 30% zoom. If a slide looks like a block of grey text
   at that size, it has too many words.
3. Export to PDF before submitting, so fonts cannot break on the judges'
   machine.
4. Keep the deck under 20 MB by compressing images to about 1600 px wide.
5. Read the deck out loud once. Anything you cannot say in 20 seconds per
   slide should be cut from the slide and moved to your speech.
