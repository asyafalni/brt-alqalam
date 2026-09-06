# One hour in the gudang — a field guide

The marbot are the daily users. **Every UI assumption in this repo rests on facts nobody has
checked**, and this is the cheapest hour available to find out which of them are wrong.

Take a notebook. Do not take a laptop.

---

## The rule: watch, don't ask

If you ask *"would you use an app to record taking soap?"* they will say **yes**. Everyone says
yes — it is polite, it costs nothing to say, and it tells you nothing. Asking a person to predict
their own future behaviour is the least reliable research there is.

So watch them do their normal work and write down what actually happens. **Say as little as
possible.** If they ask what you're doing: *"Saya mau lihat cara kerjanya dulu, biar sistemnya
nanti tidak merepotkan."* Then go quiet.

**When to go:** their busy time, not a quiet one — after subuh, or Friday before Jumat. You want
the version of their day where friction actually bites.

---

## Part 1 — Just watch (40 minutes)

Write down what you see, not what you conclude. "Took soap at 06:12, hands wet, didn't close the
door" is data. "Marbot are careless" is not.

### The people
- How many marbot are there? Do they work together or in shifts?
- Do they live at the masjid? Have they been here years, or months?

### The gudang itself
- Is it **locked**? Who has a key? Is it locked *in practice*?
- Can you see what's on the shelves, or do you have to dig?
- Is there **power** near the door? Is there **wifi signal** inside? *(Check your bars, standing
  where a tablet would go.)*
- Where could a tablet physically live so it's passed on the way in **and** on the way out?

### Each time someone takes something — record the whole event
- **What** they took, and **how much**.
- **How long** they were inside. Time it. If a visit is 20 seconds, a 10-second logging step is
  half the trip again.
- **What was in their hands** — bucket, mop, wet, gloves, phone? This decides whether a
  56px touch target is generous or still too small.
- Did they **ask anyone** first, or just take it?
- Did they **write anything down**? Anywhere? A book, a whiteboard, a WhatsApp message, nothing?
- Did they take **one thing or several**? *(This validates or kills the "one PIN per visit"
  design — if they make ten one-item trips a day, per-visit is far worse than I assumed.)*

### Their phones
- Do they **have** a smartphone? Is it in their pocket, or charging somewhere?
- What do they use it for? WhatsApp only, or more?
- **Do they read comfortably?** Watch — do they read signs, labels, messages, or do they
  recognise things by shape and place? Never test them. Just notice. If reading is effortful,
  the UI needs icons and photos, not Indonesian text, and that changes everything about it.

### Who else comes in
- Does anyone besides the marbot enter? Jamaah, panitia, tukang?
- **This is the answer to "who is losing things".** If a tukang borrows a drill and no marbot is
  present, no PIN and no kiosk will ever record it.

---

## Part 2 — The ten-minute test (do this last)

Only after you've watched. Open the stock-take screen on a phone (`cd app && npm run dev`), hand
it over, and say exactly one sentence:

> *"Coba catat: ada berapa sabun di rak itu?"*

Then **be quiet**. Do not help. Do not explain. Do not point. Sit on your hands — this is the
hardest part and the whole value of the exercise. Every time you explain something, you delete
the finding.

Write down:
- Where did they stop, hesitate, or look at you?
- Did they understand **"Bisa habis"** vs **"Barang tetap"** without help? *(My prediction: no.
  If so, that wording is wrong and needs to become an example or a picture.)*
- Did they find the **+ / −** steppers, or try to type?
- How long did one item take? **Target is ~10 seconds.**
- Did they scroll past anything without seeing it?

---

## What you're actually trying to find out

Three things, in order of how much damage they do if wrong:

1. **Would they log it at all?** If a marbot must cross the gudang and type a PIN to take a bar
   of soap, **they will just take the soap.** No software fixes that — only where the tablet
   lives and how few taps it costs. If the honest answer is "no, they wouldn't stop", tell me,
   because it means the design is wrong and we redesign around it rather than shipping something
   that quietly gets ignored.
2. **Shared tablet, or their own phones?** Their own phones would mean per-person Clerk login is
   viable and **the entire PIN subsystem could be deleted** — a large simplification.
3. **Text or pictures?** If reading is effortful, the UI is icons, photos and numbers, and the
   Bahasa labels become secondary.

---

## Bring back

- Your notes, unedited. Raw beats tidy.
- **Photos of the gudang** — the shelves, the door, where a tablet could go. I can design against
  a photo; I cannot design against "it's messy".
- One sentence answering each of the three questions above.

That goes into the design doc as **§0.5**, and it will change what gets built next. It is worth
more than another week of design.
