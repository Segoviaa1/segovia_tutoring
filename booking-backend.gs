/**
 * Drew Segovia Tutoring — Booking + Lead backend
 * -----------------------------------------------------------------
 * This runs inside a Google Sheet as an Apps Script Web App. It acts
 * as the database and API for booking.html, admin.html, and the
 * diagnostic lead capture in diagnostic.html.
 *
 * ============================================================
 * IF YOU ALREADY HAVE THE OLD VERSION DEPLOYED, DO THIS:
 * ============================================================
 * 1. Open your "Tutoring Bookings" Sheet > Extensions > Apps Script.
 * 2. Select all the old code in Code.gs and paste this entire file
 *    over it.
 * 3. Add two new tabs to the Sheet (right-click the tab bar):
 *      Tab named exactly:  Leads
 *        Row 1 headers: Timestamp | StudentName | ParentEmail |
 *                       StudentEmail | Phone | Category | GradeOrCourse |
 *                       Score | WeakSkills | Detail | Contacted
 *      Tab named exactly:  Events
 *        Row 1 headers: Timestamp | Event | Category | Detail
 *    (If you skip this, the code creates them automatically the first
 *    time a lead or event comes in — the headers above are just so the
 *    columns read nicely if you make them yourself.)
 * 4. Deploy > Manage deployments > pencil icon > Version: "New version"
 *    > Deploy. This is the step people forget: without a NEW VERSION,
 *    your live URL keeps running the old code.
 * 5. Your API_URL does not change. Nothing to update in the HTML.
 *
 * ============================================================
 * FIRST-TIME SETUP (about 10 minutes)
 * ============================================================
 * 1. Go to https://sheets.google.com and create a blank spreadsheet.
 *    Name it something like "Tutoring Bookings".
 * 2. Create these tabs:
 *      Accounts
 *        Row 1: Email | Name | Phone | PIN | CreatedAt
 *      Availability
 *        Row 1: ID | Date | Time | Duration | Booked | ParentEmail |
 *               ParentName | ParentPhone | StudentName | Note | ReminderSent
 *      Leads
 *        Row 1: Timestamp | StudentName | ParentEmail | StudentEmail |
 *               Phone | Category | GradeOrCourse | Score | WeakSkills |
 *               Detail | Contacted
 *      Events
 *        Row 1: Timestamp | Event | Category | Detail
 * 3. Extensions > Apps Script. Delete starter code, paste this file.
 * 4. Change ADMIN_KEY below to a passcode only you know.
 * 5. Deploy > New deployment > gear icon > Web app.
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 6. Deploy, authorize, copy the Web App URL (ends in /exec).
 * 7. Paste that URL into the API_URL line near the top of the <script>
 *    in BOTH booking.html and admin.html and diagnostic.html.
 * 8. Reminder emails: in the Apps Script editor click the clock icon
 *    (Triggers) > Add Trigger > function "sendSessionReminders",
 *    Event source "Time-driven", Type "Hour timer", Every hour, Save.
 *    Approve the Gmail/MailApp permission prompt.
 * 9. Uncontacted-lead nudge (optional but recommended): add a second
 *    trigger for function "nudgeUncontactedLeads", Time-driven, Day
 *    timer, 6pm-7pm. It emails you a list of diagnostic leads you
 *    haven't marked Contacted yet.
 *
 * ============================================================
 * PRIVACY NOTE — why the public read is limited
 * ============================================================
 * The old version returned every booked session's student name, parent
 * name, email, phone and notes to ANYONE who opened the /exec URL. The
 * booking page is public, so that URL is public too. This version:
 *   - listAvailability (public GET)  -> open slots + busy times ONLY,
 *                                       no names, no contact info
 *   - myBookings      (POST + email) -> only that one email's sessions
 *   - adminList       (POST + key)   -> full detail, admin only
 */


// CHANGE THIS to a passcode only you know before deploying.
var ADMIN_KEY = "Icy1311!";

// Used for notification emails.
var TUTOR_EMAIL = "drewsegovia6@gmail.com";
var TUTOR_NAME = "Drew Segovia";
var TUTOR_PHONE = "(732) 540-0177";
var SITE_URL = "https://segoviaa1.github.io/segovia_tutoring/";
var BOOKING_URL = SITE_URL + "booking.html";

// Bump this whenever you redeploy, so the Executions log can tell you
// for certain whether a request hit the current code.
var SCRIPT_VERSION = "v6-public-booking-leads";


// ---------- Infrastructure ----------

function getSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet tab: ' + name);
  return sheet;
}

/**
 * Like getSheet, but creates the tab with the given headers if it
 * doesn't exist yet. Used for Leads and Events so a missing tab can
 * never cause a lost lead.
 */
function getOrCreateSheet(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Writes a row into a "Debug" tab, creating it if needed. Exists
// because the Apps Script Executions panel is awkward to navigate —
// this way you can read the log like any other tab.
function debugLog(message) {
  try {
    var sheet = getOrCreateSheet('Debug', ['Timestamp', 'Message']);
    sheet.appendRow([new Date(), message]);
  } catch (err) {
    // If debug logging itself fails there's nothing more to do here.
    // Deliberately not throwing, so this never breaks a real request.
  }
}

function normalizeEmail(v) {
  return String(v || '').trim().toLowerCase();
}


// ---------- Routing ----------

function doGet(e) {
  var action = e.parameter.action;

  // PUBLIC. Deliberately returns no personal information — see the
  // privacy note at the top of this file.
  if (action === 'listAvailability') {
    return jsonOut({ ok: true, slots: readPublicAvailability() });
  }

  return jsonOut({ ok: false, error: 'Unknown action' });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut({ ok: false, error: 'Invalid request body' });
  }

  debugLog('doPost [' + SCRIPT_VERSION + '] action=' + body.action);

  switch (body.action) {
    // Public / parent-facing
    case 'bookSlot':            return bookSlot(body);
    case 'cancelBooking':       return cancelBooking(body);
    case 'myBookings':          return myBookings(body);
    case 'submitLead':          return submitLead(body);
    case 'logEvent':            return logEvent(body);

    // Admin only
    case 'adminList':           return adminList(body);
    case 'addSlot':             return addSlot(body);
    case 'deleteSlot':          return deleteSlot(body);
    case 'addRecurringBooking': return addRecurringBooking(body);
    case 'markLeadContacted':   return markLeadContacted(body);

    // Kept for backward compatibility with any older page still live.
    // The current booking page no longer uses accounts or PINs.
    case 'createAccount':       return createAccount(body);
    case 'login':               return loginAccount(body);

    default: return jsonOut({ ok: false, error: 'Unknown action' });
  }
}


// ---------- Availability reads ----------

// Full read, including personal info. Only ever called from code paths
// that have already checked authorization.
function readAvailability() {
  var sheet = getSheet('Availability');
  var data = sheet.getDataRange().getValues();
  var slots = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    slots.push({
      id: row[0],
      date: formatDate(row[1]),
      time: formatTime(row[2]),
      duration: row[3],
      booked: row[4] === true || row[4] === 'TRUE',
      parentEmail: row[5],
      parentName: row[6],
      parentPhone: row[7],
      studentName: row[8],
      note: row[9]
    });
  }
  return slots;
}

/**
 * PUBLIC read. Open slots are returned in full (there's nothing private
 * about an unclaimed time). Booked slots are returned as bare
 * {booked:true} markers with no id and no personal fields, so the page
 * can still show a time as taken without leaking who took it.
 */
function readPublicAvailability() {
  var sheet = getSheet('Availability');
  var data = sheet.getDataRange().getValues();
  var slots = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    var booked = row[4] === true || row[4] === 'TRUE';
    if (booked) {
      slots.push({
        date: formatDate(row[1]),
        time: formatTime(row[2]),
        duration: row[3],
        booked: true
      });
    } else {
      slots.push({
        id: row[0],
        date: formatDate(row[1]),
        time: formatTime(row[2]),
        duration: row[3],
        booked: false
      });
    }
  }
  return slots;
}

/**
 * Returns only the sessions belonging to one email address. Lets a
 * parent see and cancel their own sessions without an account or PIN.
 * Knowing the email address is the credential — the same standard the
 * old 4-digit PIN actually provided, with far less friction.
 */
function myBookings(body) {
  var email = normalizeEmail(body.parentEmail);
  if (!email) return jsonOut({ ok: false, error: 'Email is required.' });

  var sheet = getSheet('Availability');
  var data = sheet.getDataRange().getValues();
  var mine = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    var booked = row[4] === true || row[4] === 'TRUE';
    if (!booked) continue;
    if (normalizeEmail(row[5]) !== email) continue;
    mine.push({
      id: row[0],
      date: formatDate(row[1]),
      time: formatTime(row[2]),
      duration: row[3],
      studentName: row[8],
      note: row[9]
    });
  }
  return jsonOut({ ok: true, bookings: mine, name: lookupParentName(email) });
}

function lookupParentName(email) {
  var sheet = getSheet('Availability');
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (normalizeEmail(data[i][5]) === email && data[i][6]) return data[i][6];
  }
  return '';
}

// Admin-only full listing, including every parent's contact details.
function adminList(body) {
  if (body.adminKey !== ADMIN_KEY) return jsonOut({ ok: false, error: 'Not authorized' });
  return jsonOut({ ok: true, slots: readAvailability(), leads: readLeads() });
}


function formatDate(val) {
  if (Object.prototype.toString.call(val) === '[object Date]') {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return val;
}

// Google Sheets silently converts a plain "15:00" string into a real
// time value when it's entered into a cell. This normalizes it back to
// a plain 24-hour "HH:mm" string so the rest of the code (and the
// front-end) can always rely on getting a string.
function formatTime(val) {
  if (Object.prototype.toString.call(val) === '[object Date]') {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'HH:mm');
  }
  return val;
}


// ---------- Availability writes (admin) ----------

function addSlot(body) {
  if (body.adminKey !== ADMIN_KEY) return jsonOut({ ok: false, error: 'Not authorized' });
  var sheet = getSheet('Availability');
  var id = Utilities.getUuid();
  sheet.appendRow([id, body.date, body.time, body.duration || 60, false, '', '', '', '', '', false]);
  return jsonOut({ ok: true, id: id });
}

function deleteSlot(body) {
  if (body.adminKey !== ADMIN_KEY) return jsonOut({ ok: false, error: 'Not authorized' });
  var sheet = getSheet('Availability');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === body.id) {
      sheet.deleteRow(i + 1);
      return jsonOut({ ok: true });
    }
  }
  return jsonOut({ ok: false, error: 'Slot not found' });
}


// ---------- Booking ----------

function bookSlot(body) {
  var email = normalizeEmail(body.parentEmail);
  if (!email || !body.parentName || !body.studentName) {
    return jsonOut({ ok: false, error: 'Name, email, and student name are required.' });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var bookedSlotInfo = null;
  try {
    var sheet = getSheet('Availability');
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === body.id) {
        var alreadyBooked = data[i][4] === true || data[i][4] === 'TRUE';
        if (alreadyBooked) {
          return jsonOut({ ok: false, error: 'That slot was just booked by someone else. Please pick another.' });
        }
        sheet.getRange(i + 1, 5, 1, 6).setValues([[
          true, email, body.parentName, body.parentPhone || '', body.studentName, body.note || ''
        ]]);
        bookedSlotInfo = {
          date: formatDate(data[i][1]),
          time: formatTime(data[i][2]),
          duration: data[i][3] || 60
        };
        break;
      }
    }
  } finally {
    lock.releaseLock();
  }

  if (!bookedSlotInfo) {
    debugLog('bookSlot: no matching slot found for id=' + body.id);
    return jsonOut({ ok: false, error: 'Slot not found' });
  }

  // Email sending happens outside the lock so it can't hold up other
  // parents booking at the same time. If it fails for any reason the
  // booking itself has already succeeded — log it rather than showing
  // the parent an error.
  try {
    sendBookingEmails(body, bookedSlotInfo);
  } catch (err) {
    debugLog('bookSlot: sendBookingEmails() THREW: ' + err);
  }

  logEventRow('booking_completed', body.source || 'booking_page', body.studentName);
  return jsonOut({ ok: true });
}

function sendBookingEmails(body, slot) {
  var dateLabel = formatDateForEmail(slot.date);
  var timeLabel = formatTimeForEmail(slot.time);

  var tutorSubject = 'New booking: ' + body.studentName + ' — ' + dateLabel + ' at ' + timeLabel;
  var tutorBody =
    'A new session was booked.\n\n' +
    'Student: ' + body.studentName + '\n' +
    'Parent: ' + body.parentName + '\n' +
    'Email: ' + body.parentEmail + '\n' +
    'Phone: ' + (body.parentPhone || '(not provided)') + '\n' +
    'Date: ' + dateLabel + '\n' +
    'Time: ' + timeLabel + '\n' +
    'Duration: ' + slot.duration + ' minutes\n' +
    (body.note ? 'Note: ' + body.note + '\n' : '');
  MailApp.sendEmail(TUTOR_EMAIL, tutorSubject, tutorBody);

  var parentSubject = 'Session confirmed — ' + dateLabel + ' at ' + timeLabel;
  var parentBody =
    'Hi ' + body.parentName + ',\n\n' +
    'This confirms ' + body.studentName + '’s tutoring session with ' + TUTOR_NAME + ':\n\n' +
    'Date: ' + dateLabel + '\n' +
    'Time: ' + timeLabel + '\n' +
    'Duration: ' + slot.duration + ' minutes\n\n' +
    'Need to reschedule or cancel? Go to ' + BOOKING_URL + ', click "Manage my sessions", ' +
    'and enter this email address (' + body.parentEmail + '). No password needed. ' +
    'Cancelling opens the slot back up for someone else.\n\n' +
    'Questions in the meantime? Reach ' + TUTOR_NAME + ' at ' + TUTOR_EMAIL + ' or ' + TUTOR_PHONE + '.\n\n' +
    '— ' + TUTOR_NAME;
  MailApp.sendEmail(body.parentEmail, parentSubject, parentBody);
}

function cancelBooking(body) {
  var sheet = getSheet('Availability');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === body.id) {
      var isOwner = normalizeEmail(data[i][5]) === normalizeEmail(body.parentEmail);
      var isAdmin = body.adminKey === ADMIN_KEY;
      if (!isOwner && !isAdmin) return jsonOut({ ok: false, error: 'Not authorized' });
      sheet.getRange(i + 1, 5, 1, 6).setValues([[false, '', '', '', '', '']]);
      return jsonOut({ ok: true });
    }
  }
  return jsonOut({ ok: false, error: 'Booking not found' });
}


// ---------- Recurring client bookings (admin) ----------
// Unlike addSlot (which posts an OPEN slot for any parent to claim),
// this books the same weekly time directly for one specific client,
// immediately, for a chosen number of weeks.

function addRecurringBooking(body) {
  if (body.adminKey !== ADMIN_KEY) return jsonOut({ ok: false, error: 'Not authorized' });

  if (!body.studentName || !body.parentName || !body.parentEmail) {
    return jsonOut({ ok: false, error: 'Student name, parent name, and parent email are required.' });
  }
  if (!body.startDate || !body.time) {
    return jsonOut({ ok: false, error: 'Start date and time are required.' });
  }
  var weeks = parseInt(body.weeks, 10);
  if (!weeks || weeks < 1) {
    return jsonOut({ ok: false, error: 'Number of weeks must be at least 1.' });
  }
  var duration = parseInt(body.duration, 10) || 60;

  var sheet = getSheet('Availability');
  var startParts = String(body.startDate).split('-');
  var startDate = new Date(
    parseInt(startParts[0], 10),
    parseInt(startParts[1], 10) - 1,
    parseInt(startParts[2], 10)
  );

  var created = 0;
  for (var w = 0; w < weeks; w++) {
    var thisDate = new Date(startDate.getTime());
    thisDate.setDate(thisDate.getDate() + (7 * w));
    var y = thisDate.getFullYear();
    var m = ('0' + (thisDate.getMonth() + 1)).slice(-2);
    var d = ('0' + thisDate.getDate()).slice(-2);
    var dateStr = y + '-' + m + '-' + d;

    sheet.appendRow([
      Utilities.getUuid(), dateStr, body.time, duration, true,
      normalizeEmail(body.parentEmail), body.parentName, body.parentPhone || '',
      body.studentName, body.note || '', false
    ]);
    created++;
  }

  return jsonOut({ ok: true, count: created });
}


// ---------- Diagnostic leads ----------
// This is what the diagnostic page posts to when a student finishes and
// asks for a study plan. The old version only opened a mailto: link,
// which meant the lead was lost unless the visitor completed a second
// manual step in their own mail client.

function submitLead(body) {
  var studentName = String(body.studentName || '').trim();
  var parentEmail = normalizeEmail(body.parentEmail);
  var studentEmail = normalizeEmail(body.studentEmail);
  var contactEmail = parentEmail || studentEmail;

  if (!studentName || !contactEmail) {
    return jsonOut({ ok: false, error: 'Name and at least one email address are required.' });
  }

  var sheet = getOrCreateSheet('Leads', [
    'Timestamp', 'StudentName', 'ParentEmail', 'StudentEmail', 'Phone',
    'Category', 'GradeOrCourse', 'Score', 'WeakSkills', 'Detail', 'Contacted'
  ]);

  sheet.appendRow([
    new Date(),
    studentName,
    parentEmail,
    studentEmail,
    String(body.phone || '').trim(),
    String(body.category || ''),
    String(body.gradeOrCourse || ''),
    String(body.score || ''),
    String(body.weakSkills || ''),
    String(body.detail || ''),
    ''
  ]);

  try {
    sendLeadEmails(body, studentName, contactEmail, parentEmail, studentEmail);
  } catch (err) {
    // The lead is already safely in the sheet. An email failure must
    // never make the visitor think their submission didn't go through.
    debugLog('submitLead: sendLeadEmails() THREW: ' + err);
  }

  logEventRow('lead_submitted', String(body.category || ''), String(body.gradeOrCourse || ''));
  return jsonOut({ ok: true });
}

function sendLeadEmails(body, studentName, contactEmail, parentEmail, studentEmail) {
  var subjectLabel = String(body.categoryLabel || body.category || 'Diagnostic');

  var tutorSubject = 'NEW LEAD: ' + studentName + ' — ' + subjectLabel +
    (body.score ? ' (' + body.score + ')' : '');
  var tutorBody =
    'A student finished the diagnostic and asked for a study plan.\n\n' +
    'Student: ' + studentName + '\n' +
    'Parent email: ' + (parentEmail || '(not provided)') + '\n' +
    'Student email: ' + (studentEmail || '(not provided)') + '\n' +
    'Phone: ' + (String(body.phone || '').trim() || '(not provided)') + '\n' +
    'Diagnostic: ' + subjectLabel + '\n' +
    (body.gradeOrCourse ? 'Grade/course: ' + body.gradeOrCourse + '\n' : '') +
    'Score: ' + (body.score || 'n/a') + '\n\n' +
    'Areas needing review: ' + (body.weakSkills || 'none — strong across the board') + '\n\n' +
    '--- Question-by-question ---\n' +
    (body.detail || '(none)') + '\n\n' +
    'Reply to ' + contactEmail + ' within a day while it’s still fresh.\n' +
    'When you’ve reached out, put an x in the Contacted column of the Leads tab\n' +
    'so the daily nudge email stops listing them.';
  MailApp.sendEmail(TUTOR_EMAIL, tutorSubject, tutorBody);

  // Auto-acknowledgement, so the visitor knows it worked and gets a
  // second chance to convert straight into a booking.
  var ackSubject = 'Your diagnostic results — ' + subjectLabel;
  var ackBody =
    'Hi ' + studentName + ',\n\n' +
    'Thanks for taking the diagnostic. Here’s what came back:\n\n' +
    'Score: ' + (body.score || 'n/a') + '\n' +
    'Areas to focus on: ' + (body.weakSkills || 'none — strong across the board') + '\n\n' +
    'I’ll look these over and send back specific next steps within a day.\n\n' +
    'If you’d rather just talk it through, you can grab a free intro call here:\n' +
    BOOKING_URL + '\n\n' +
    'Questions any time: ' + TUTOR_EMAIL + ' or ' + TUTOR_PHONE + '.\n\n' +
    '— ' + TUTOR_NAME + '\n' +
    'Math & Physics Tutoring · ' + SITE_URL;
  MailApp.sendEmail(contactEmail, ackSubject, ackBody);
}

function readLeads() {
  var sheet = getOrCreateSheet('Leads', [
    'Timestamp', 'StudentName', 'ParentEmail', 'StudentEmail', 'Phone',
    'Category', 'GradeOrCourse', 'Score', 'WeakSkills', 'Detail', 'Contacted'
  ]);
  var data = sheet.getDataRange().getValues();
  var leads = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[1]) continue;
    leads.push({
      rowIndex: i + 1,
      timestamp: row[0] ? formatDate(row[0]) : '',
      studentName: row[1],
      parentEmail: row[2],
      studentEmail: row[3],
      phone: row[4],
      category: row[5],
      gradeOrCourse: row[6],
      score: row[7],
      weakSkills: row[8],
      contacted: String(row[10] || '').trim() !== ''
    });
  }
  leads.reverse(); // newest first
  return leads;
}

function markLeadContacted(body) {
  if (body.adminKey !== ADMIN_KEY) return jsonOut({ ok: false, error: 'Not authorized' });
  var sheet = getSheet('Leads');
  var rowIndex = parseInt(body.rowIndex, 10);
  if (!rowIndex || rowIndex < 2) return jsonOut({ ok: false, error: 'Bad row' });
  sheet.getRange(rowIndex, 11).setValue(body.contacted === false ? '' : 'x');
  return jsonOut({ ok: true });
}


// ---------- Funnel event tracking ----------
// Deliberately minimal: no cookies, no third-party analytics, no IP
// logging. Just enough counting to answer "how many people start the
// diagnostic vs. finish it vs. hand over an email".

function logEvent(body) {
  logEventRow(String(body.event || ''), String(body.category || ''), String(body.detail || ''));
  return jsonOut({ ok: true });
}

function logEventRow(event, category, detail) {
  try {
    if (!event) return;
    var sheet = getOrCreateSheet('Events', ['Timestamp', 'Event', 'Category', 'Detail']);
    sheet.appendRow([new Date(), event, category || '', detail || '']);
  } catch (err) {
    debugLog('logEventRow failed: ' + err);
  }
}

/**
 * Run this manually any time (select it in the dropdown and hit Run) to
 * get a plain-language funnel summary emailed to you.
 */
function emailFunnelSummary() {
  var sheet = getOrCreateSheet('Events', ['Timestamp', 'Event', 'Category', 'Detail']);
  var data = sheet.getDataRange().getValues();
  var counts = {};
  for (var i = 1; i < data.length; i++) {
    var ev = data[i][1];
    if (!ev) continue;
    counts[ev] = (counts[ev] || 0) + 1;
  }

  var started = counts['diagnostic_started'] || 0;
  var finished = counts['diagnostic_completed'] || 0;
  var leads = counts['lead_submitted'] || 0;
  var bookings = counts['booking_completed'] || 0;

  function pct(a, b) { return b ? Math.round((a / b) * 100) + '%' : '—'; }

  var lines = [
    'Funnel summary (all time)',
    '',
    'Diagnostics started:   ' + started,
    'Diagnostics finished:  ' + finished + '   (' + pct(finished, started) + ' of starts)',
    'Leads captured:        ' + leads + '   (' + pct(leads, finished) + ' of finishers)',
    'Sessions booked:       ' + bookings,
    '',
    'Every other event logged:'
  ];
  Object.keys(counts).sort().forEach(function (k) {
    lines.push('  ' + k + ': ' + counts[k]);
  });

  MailApp.sendEmail(TUTOR_EMAIL, 'Tutoring funnel summary', lines.join('\n'));
}

/**
 * Daily nudge for leads you haven't followed up on. Set this on a Day
 * timer trigger (see setup step 9). Sends nothing if there's nothing
 * outstanding, so it won't become inbox noise.
 */
function nudgeUncontactedLeads() {
  var leads = readLeads();
  var now = new Date();
  var outstanding = [];

  for (var i = 0; i < leads.length; i++) {
    if (leads[i].contacted) continue;
    outstanding.push(leads[i]);
  }

  if (outstanding.length === 0) return;

  var lines = [
    'You have ' + outstanding.length + ' diagnostic lead' +
      (outstanding.length === 1 ? '' : 's') + ' you haven’t marked as contacted:',
    ''
  ];
  outstanding.forEach(function (l) {
    lines.push('• ' + l.studentName + ' — ' + (l.category || '') +
      (l.gradeOrCourse ? ' (' + l.gradeOrCourse + ')' : '') +
      ' — ' + (l.parentEmail || l.studentEmail) +
      ' — submitted ' + l.timestamp);
  });
  lines.push('');
  lines.push('Mark the Contacted column in the Leads tab once you’ve replied.');

  MailApp.sendEmail(TUTOR_EMAIL, 'Follow up: ' + outstanding.length + ' tutoring lead' +
    (outstanding.length === 1 ? '' : 's') + ' waiting', lines.join('\n'));
}


// ---------- 24-hour reminder emails ----------
// Not called by the web app. Set on an hourly time-driven trigger (see
// setup step 8). Finds every booked session roughly 24 hours out that
// hasn't had a reminder yet, emails the parent, marks it sent.

function sendSessionReminders() {
  var sheet = getSheet('Availability');
  var data = sheet.getDataRange().getValues();
  var now = new Date();

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;

    var booked = row[4] === true || row[4] === 'TRUE';
    if (!booked) continue;

    var reminderSent = row[10] === true || row[10] === 'TRUE';
    if (reminderSent) continue;

    var dateStr = formatDate(row[1]);
    var timeStr = formatTime(row[2]);
    if (!dateStr || !timeStr) continue;

    var sessionStart = combineDateTime(dateStr, timeStr);
    var hoursUntil = (sessionStart.getTime() - now.getTime()) / (1000 * 60 * 60);

    // With an hourly trigger this ~2-hour window guarantees one (and
    // only one) check lands inside it per session, so reminders go out
    // once, right around the 24-hour mark, never duplicated.
    if (hoursUntil <= 25 && hoursUntil >= 23) {
      var parentEmail = row[5];
      var parentName = row[6];
      var studentName = row[8];
      var duration = row[3] || 60;

      if (parentEmail) {
        var dateLabel = formatDateForEmail(dateStr);
        var timeLabel = formatTimeForEmail(timeStr);

        var subject = 'Reminder: tutoring session tomorrow at ' + timeLabel;
        var emailBody =
          'Hi ' + (parentName || 'there') + ',\n\n' +
          'Just a reminder that ' + (studentName || 'your student') +
          '’s tutoring session with ' + TUTOR_NAME + ' is coming up:\n\n' +
          dateLabel + ' at ' + timeLabel + ' (' + duration + ' minutes)\n\n' +
          'Need to reschedule or cancel? Go to ' + BOOKING_URL + ', click ' +
          '"Manage my sessions", and enter this email address. No password needed.\n\n' +
          'Questions in the meantime? Reach ' + TUTOR_NAME + ' at ' + TUTOR_EMAIL +
          ' or ' + TUTOR_PHONE + '.\n\n' +
          '— ' + TUTOR_NAME;

        MailApp.sendEmail(parentEmail, subject, emailBody);
      }

      sheet.getRange(i + 1, 11).setValue(true); // column K = ReminderSent
    }
  }
}

function combineDateTime(dateStr, timeStr) {
  var dParts = String(dateStr).split('-');
  var tParts = String(timeStr).split(':');
  return new Date(
    parseInt(dParts[0], 10),
    parseInt(dParts[1], 10) - 1,
    parseInt(dParts[2], 10),
    parseInt(tParts[0], 10),
    parseInt(tParts[1], 10)
  );
}

function formatDateForEmail(dateStr) {
  var parts = String(dateStr).split('-');
  var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];
  return days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate();
}

function formatTimeForEmail(timeStr) {
  var parts = String(timeStr).split(':');
  var h = parseInt(parts[0], 10);
  var m = parts[1];
  var ampm = h >= 12 ? 'PM' : 'AM';
  var h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + ':' + m + ' ' + ampm;
}


// ---------- Debug helpers ----------

/**
 * Select this in the dropdown and click Run to send yourself both
 * booking emails with fake data. If two emails arrive, the email code
 * is fine and a real booking failing means you need a fresh deployment.
 */
function debugSendBookingEmails() {
  sendBookingEmails(
    {
      studentName: "Test Student",
      parentName: "Test Parent",
      parentEmail: TUTOR_EMAIL,
      parentPhone: "",
      note: "This is a debug test, not a real booking."
    },
    { date: "2026-09-15", time: "15:00", duration: 60 }
  );
  Logger.log("Debug emails sent — check your inbox for two emails.");
}

/**
 * Sends yourself the lead notification + acknowledgement with fake
 * data, to confirm the new diagnostic lead path works end to end.
 */
function debugSendLeadEmails() {
  sendLeadEmails(
    {
      category: 'sat',
      categoryLabel: 'SAT Prep',
      score: 'Math 3/4, R&W 2/4',
      weakSkills: 'Advanced Math, Craft & Structure',
      detail: '(debug run)',
      phone: ''
    },
    'Test Student', TUTOR_EMAIL, TUTOR_EMAIL, ''
  );
  Logger.log("Debug lead emails sent — check your inbox for two emails.");
}


// ---------- Accounts (legacy) ----------
// The booking page no longer uses accounts or PINs — a parent books
// with just their name and email, and manages sessions by entering
// that email. These two functions stay only so an older cached copy of
// the page doesn't hard-error for someone mid-session.

function createAccount(body) {
  var sheet = getSheet('Accounts');
  var data = sheet.getDataRange().getValues();
  var email = normalizeEmail(body.email);

  if (!email || !body.name || !body.pin) {
    return jsonOut({ ok: false, error: 'Missing required fields' });
  }
  for (var i = 1; i < data.length; i++) {
    if (normalizeEmail(data[i][0]) === email) {
      return jsonOut({ ok: false, error: 'An account with this email already exists. Try logging in instead.' });
    }
  }
  sheet.appendRow([email, body.name, body.phone || '', body.pin, new Date()]);
  return jsonOut({ ok: true, account: { email: email, name: body.name, phone: body.phone || '' } });
}

function loginAccount(body) {
  var sheet = getSheet('Accounts');
  var data = sheet.getDataRange().getValues();
  var email = normalizeEmail(body.email);

  for (var i = 1; i < data.length; i++) {
    if (normalizeEmail(data[i][0]) === email) {
      if (String(data[i][3]) === String(body.pin)) {
        return jsonOut({ ok: true, account: { email: data[i][0], name: data[i][1], phone: data[i][2] } });
      }
      return jsonOut({ ok: false, error: 'Incorrect PIN' });
    }
  }
  return jsonOut({ ok: false, error: 'No account found with that email' });
}
