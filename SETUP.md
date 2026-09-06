# Setup & growth checklist

Everything in the site is already wired up. There are exactly **two things
you must do** before the new lead capture works, and then a short list of
growth items that don't involve code.

---

## 1. Redeploy the backend (required — 5 minutes)

The diagnostic now posts leads to your Google Sheet instead of relying on
a `mailto:` link. That needs the new backend code.

1. Open your **Tutoring Bookings** Google Sheet.
2. **Extensions → Apps Script.**
3. Select all the old code in `Code.gs` and paste in the entire contents of
   **`booking-backend.gs`** (in this folder) over it.
4. **Deploy → Manage deployments → pencil icon → Version: "New version" → Deploy.**

   This is the step that's easy to miss. Without picking **New version**,
   your live URL keeps running the old code and nothing changes.

Your API URL doesn't change, so there's nothing to edit in the HTML.

Two new tabs (`Leads` and `Events`) get created automatically the first
time a lead or event comes in. You don't have to make them by hand.

### Then test it

In the Apps Script editor, pick `debugSendLeadEmails` from the function
dropdown and click **Run**. You should get two emails. If you do, the lead
path works end to end.

## 2. Set up two triggers (recommended — 3 minutes)

In the Apps Script editor, click the **clock icon** (Triggers) on the left:

| Function | Event source | Type | Why |
|---|---|---|---|
| `sendSessionReminders` | Time-driven | Hour timer, every hour | 24-hour reminder emails (you may already have this) |
| `nudgeUncontactedLeads` | Time-driven | Day timer, 6pm–7pm | Emails you any diagnostic lead you haven't followed up on |

The nudge sends nothing when there's nothing outstanding, so it won't
become inbox noise.

---

## What changed, and why

### The diagnostic actually captures leads now

Before, a student filled in their name and email, hit "Send my results,"
and a `mailto:` link opened. If they didn't then complete a second step
inside their own mail client, **the lead vanished** — and that step fails
outright on school Chromebooks and many phones. Every finisher who didn't
have a working mail app was lost silently.

Now the lead is written to your `Leads` tab first, you get a notification
email with the full question-by-question breakdown, and the student gets
an auto-acknowledgement with a link to book. The `mailto:` fallback only
appears if the write genuinely fails.

### Booking no longer requires an account

Parents couldn't see whether you had a single open time without inventing
a 4-digit PIN first. Now open times are visible immediately and the
booking form is inline on the slot they clicked. Returning parents manage
sessions by entering their email — no password.

### Privacy fix

Your old `listAvailability` endpoint returned **every booked student's
name, parent name, email, phone, and notes** to anyone who opened the
`/exec` URL — and that URL is public, because the booking page calls it
from the browser. The public read now returns open times plus "busy"
markers only. Full detail requires your admin passcode.

### Admin moved

The "For Drew" tab was visible to every parent on the booking page. It's
now **`admin.html`**, which isn't linked from anywhere public and carries
a `noindex` tag. Bookmark it. It also now has a **leads inbox** with a
one-click pre-written follow-up email per lead.

### New pages

| File | What it is |
|---|---|
| `diagnostic.html` | The diagnostic, renamed from `sat-diagnostic.html` (it covers math and physics now too). Adds three physics question sets. |
| `sat-diagnostic.html` | A redirect stub, so any link you've already shared or printed still works. |
| `physics.html` | Dedicated AP Physics landing page. |
| `admin.html` | Your private dashboard. |
| `booking-backend.gs` | The backend, as plain text instead of RTF. |

---

## 3. One thing worth paying for

Your URL is `segoviaa1.github.io/segovia_tutoring`. That's hard to say out
loud, impossible to remember, and takes two lines on a flyer.

A domain like **segoviatutoring.com** is about $12/year and makes every
offline channel work better — the flyer, a business card, telling a parent
at a school event. GitHub Pages supports custom domains for free:
Settings → Pages → Custom domain.

When you buy one, update `SITE_URL` in `booking-backend.gs` and the
`og:url` / `canonical` tags in each HTML file, and regenerate the flyer QR
code (see below).

### Regenerating the flyer QR code

The QR in `tutoring-flyer.html` is a hand-built SVG pointing at
`diagnostic.html`. If your URL changes, it must be regenerated — a QR
encodes its payload literally, so editing the text nearby doesn't change
where it points. Ask me and I'll rebuild it.

---

## 4. Google Business Profile (free — biggest single win)

Everything above improves how well your site converts the people who
reach it. This is about *getting* people there — and right now the top of
your funnel is essentially empty.

A Google Business Profile is what makes you appear for **"math tutor
Falmouth"** and in Google Maps. It's free and takes about 15 minutes.

1. Go to **google.com/business** and sign in.
2. Business name: **Drew Segovia — Math & Physics Tutoring**
3. Category: **Tutoring service** (add "Test preparation center" as secondary)
4. Choose **"I deliver goods and services to my customers"** — a
   service-area business, so your home address stays private. Set the
   service area to Falmouth, Mashpee, Bourne, Sandwich, Barnstable.
5. Phone: (732) 540-0177 · Website: your URL
6. Verify (usually a postcard or phone call).
7. Add hours, and 3–5 photos. A photo of you matters more than you'd think —
   parents are choosing who to trust with their kid.

**Then ask your two existing happy families for a Google review.** Two
reviews puts you ahead of most individual tutors in the area, who have
zero. This is the highest-leverage 20 minutes in this whole document.

---

## 5. Lead follow-up routine

Speed of reply is the single biggest factor in whether a diagnostic lead
becomes a student. A reply within an hour converts dramatically better
than one the next day.

1. Lead email arrives with the full breakdown.
2. Open `admin.html`, find them in the leads inbox, click **Email** — the
   follow-up is pre-written with their weak areas filled in. Add two or
   three specific sentences about *their* results.
3. Click **Mark contacted** so the nightly nudge stops listing them.

The pre-written email ends with the free-intro-call link, so the ask is
already built in.

---

## 6. Referral loop

There's now a referral offer on the pricing section of the homepage: send
someone who books a package, get a free session. It costs you one session
to acquire a student worth several hundred dollars.

It only works if people hear it. Send this to your current families once:

> Hi [name],
>
> Quick note — I'm taking on a few more students this term, and I'd
> rather they come from families like yours than from an ad.
>
> If you know someone whose kid is struggling with math or physics, send
> them my way: [your URL]. If they book a package, your next session is
> free.
>
> Thanks either way,
> Drew

Then mention it once, in person, at the end of a session. That's it.

---

## 7. Check your funnel numbers

The site now counts `diagnostic_started`, `diagnostic_completed`,
`lead_submitted`, and `booking_completed` in the `Events` tab.

In the Apps Script editor, run **`emailFunnelSummary`** any time and
you'll get a plain-language breakdown emailed to you:

```
Diagnostics started:   47
Diagnostics finished:  31   (66% of starts)
Leads captured:        12   (39% of finishers)
Sessions booked:       5
```

Give it a few weeks of traffic, then look. If lots of people start the
diagnostic and few finish, the questions are too hard or too long. If
lots finish and few leave an email, the ask needs work. Guessing at this
without numbers is how people waste months.

---

## Quick reference

| Page | URL |
|---|---|
| Home | `/index.html` |
| Booking (public) | `/booking.html` |
| Diagnostic | `/diagnostic.html` |
| Physics | `/physics.html` |
| **Admin (private)** | `/admin.html` |
| Flyer (print) | `/tutoring-flyer.html` |

Your admin passcode is set at the top of `booking-backend.gs` in the
`ADMIN_KEY` line. It's currently the same one you were using. Because it
now also guards the parent contact details behind `adminList`, it's worth
changing to something less guessable — change it in that one line and
redeploy a new version.
