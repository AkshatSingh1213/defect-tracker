const nodemailer = require('nodemailer');

/**
 * Creates a Nodemailer transporter.
 *
 * Outlook / Office365 (smtp.office365.com) requires:
 *   - port 587 with STARTTLS  (secure: false + starttls upgrade)
 *   - tls.ciphers set to avoid handshake failures on some IBM corp proxies
 *
 * Gmail uses smtp.gmail.com:587 with the same settings, so this works for
 * both.  Switch SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS in .env.
 */
const createTransporter = () => {
  const port = parseInt(process.env.SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,          // true only for SSL/465; 587 uses STARTTLS
    requireTLS: port !== 465,      // force STARTTLS upgrade on 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      ciphers: 'SSLv3',            // needed for some Office365 / IBM proxies
      rejectUnauthorized: false,   // tolerate self-signed corp certs
    },
  });
};

/** Fire-and-forget wrapper — logs full error so it's visible in server logs. */
const send = async (transporter, mailOptions) => {
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️  Email sent to [${mailOptions.to}] — messageId: ${info.messageId}`);
  } catch (err) {
    console.error(`❌ Email FAILED to [${mailOptions.to}]: ${err.message}`);
    // surface the full SMTP response so misconfiguration is obvious
    if (err.response) console.error('   SMTP response:', err.response);
  }
};

// ── Shared HTML wrapper ───────────────────────────────────────────────────────
const wrap = (body) => `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b;">
    ${body}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
    <p style="font-size:11px;color:#94a3b8;margin:0;">
      DefectTrack · Automated notification · Do not reply to this email
    </p>
  </div>`;

const defectBlock = (defect) => `
  <div style="background:#f8fafc;border-radius:8px;padding:20px;margin:16px 0;border:1px solid #e2e8f0;">
    <h3 style="margin:0 0 12px;font-size:15px;">${defect.title}</h3>
    <table style="border-collapse:collapse;width:100%;font-size:13px;">
      <tr><td style="padding:3px 0;color:#64748b;width:140px;">Defect #</td><td><strong>${defect.id}</strong></td></tr>
      <tr><td style="padding:3px 0;color:#64748b;">Severity</td><td>${defect.severity}</td></tr>
      <tr><td style="padding:3px 0;color:#64748b;">Environment</td><td>${defect.environment}</td></tr>
      <tr><td style="padding:3px 0;color:#64748b;">Assigned Team</td><td><strong>${(defect.assigned_team || '—').toUpperCase()}</strong></td></tr>
    </table>
  </div>`;

const viewBtn = (defect) =>
  `<a href="${process.env.APP_BASE_URL}/defects/${defect.id}"
      style="display:inline-block;background:#0d9488;color:white;padding:10px 22px;
             border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;">
     View Defect →
   </a>`;

// ── 1. New defect raised ───────────────────────────────────────────────────────
const sendDefectRaisedEmail = async ({ defect, raisedBy, recipients }) => {
  if (!recipients || recipients.length === 0) return;
  const validRecipients = recipients.filter(Boolean);
  if (validRecipients.length === 0) return;

  const t = createTransporter();
  await send(t, {
    from: `"DefectTrack" <${process.env.SMTP_USER}>`,
    to: validRecipients.join(', '),
    subject: `[New Defect #${defect.id}] ${defect.title}`,
    html: wrap(`
      <h2 style="color:#0d9488;font-size:18px;">🐛 New Defect Raised</h2>
      ${defectBlock(defect)}
      <p style="font-size:13px;margin:8px 0;">
        <strong>Raised by:</strong> ${raisedBy}
      </p>
      ${viewBtn(defect)}`),
  });
};

// ── 2. Status changed ─────────────────────────────────────────────────────────
const sendStatusChangeEmail = async ({ defect, oldStatus, newStatus, changedBy, recipients }) => {
  if (!recipients || recipients.length === 0) return;
  const validRecipients = recipients.filter(Boolean);
  if (validRecipients.length === 0) return;

  const statusPill = (s, bg, fg = '#fff') =>
    `<span style="background:${bg};color:${fg};padding:2px 10px;border-radius:4px;font-size:12px;font-weight:600;">${s}</span>`;

  const t = createTransporter();
  await send(t, {
    from: `"DefectTrack" <${process.env.SMTP_USER}>`,
    to: validRecipients.join(', '),
    subject: `[Defect #${defect.id}] Status: ${oldStatus} → ${newStatus}`,
    html: wrap(`
      <h2 style="color:#1e293b;font-size:18px;">🔄 Defect Status Updated</h2>
      ${defectBlock(defect)}
      <p style="font-size:13px;margin:8px 0;">
        <strong>Status change:</strong>&nbsp;
        ${statusPill(oldStatus, '#e2e8f0', '#475569')}
        &nbsp;→&nbsp;
        ${statusPill(newStatus, '#0d9488')}
      </p>
      <p style="font-size:13px;margin:4px 0;"><strong>Changed by:</strong> ${changedBy}</p>
      ${viewBtn(defect)}`),
  });
};

// ── 3. Team reassigned ────────────────────────────────────────────────────────
const sendTeamReassignEmail = async ({ defect, oldTeam, newTeam, reassignedBy, recipients }) => {
  if (!recipients || recipients.length === 0) return;
  const validRecipients = recipients.filter(Boolean);
  if (validRecipients.length === 0) return;

  const teamPill = (t, bg) =>
    `<span style="background:${bg};color:#fff;padding:2px 10px;border-radius:4px;font-size:12px;font-weight:600;">${(t || '—').toUpperCase()}</span>`;

  const trans = createTransporter();
  await send(trans, {
    from: `"DefectTrack" <${process.env.SMTP_USER}>`,
    to: validRecipients.join(', '),
    subject: `[Defect #${defect.id}] Reassigned: ${(oldTeam || '—').toUpperCase()} → ${newTeam.toUpperCase()}`,
    html: wrap(`
      <h2 style="color:#7c3aed;font-size:18px;">🔀 Defect Team Reassigned</h2>
      ${defectBlock({ ...defect, assigned_team: newTeam })}
      <p style="font-size:13px;margin:8px 0;">
        <strong>Team change:</strong>&nbsp;
        ${teamPill(oldTeam, '#94a3b8')}
        &nbsp;→&nbsp;
        ${teamPill(newTeam, '#7c3aed')}
      </p>
      <p style="font-size:13px;margin:4px 0;"><strong>Reassigned by:</strong> ${reassignedBy}</p>
      ${viewBtn(defect)}`),
  });
};

module.exports = { sendDefectRaisedEmail, sendStatusChangeEmail, sendTeamReassignEmail };
