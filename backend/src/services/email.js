const nodemailer = require('nodemailer');

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const sendStatusChangeEmail = async ({ defect, oldStatus, newStatus, changedBy, recipients }) => {
  if (!recipients || recipients.length === 0) return;

  const transporter = createTransporter();
  const defectUrl = `${process.env.APP_BASE_URL}/defects/${defect.id}`;

  const subject = `[Defect #${defect.id}] Status changed: ${oldStatus} → ${newStatus}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1e293b;">Defect Status Update</h2>
      <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 16px 0;">
        <h3 style="margin: 0 0 12px;">${defect.title}</h3>
        <p style="margin: 4px 0;"><strong>Defect #:</strong> ${defect.id}</p>
        <p style="margin: 4px 0;"><strong>Status Change:</strong> 
          <span style="background:#e2e8f0; padding:2px 8px; border-radius:4px;">${oldStatus}</span>
          → 
          <span style="background:#0d9488; color:white; padding:2px 8px; border-radius:4px;">${newStatus}</span>
        </p>
        <p style="margin: 4px 0;"><strong>Changed By:</strong> ${changedBy}</p>
        <p style="margin: 4px 0;"><strong>Severity:</strong> ${defect.severity}</p>
        <p style="margin: 4px 0;"><strong>Environment:</strong> ${defect.environment}</p>
      </div>
      <a href="${defectUrl}" style="display:inline-block; background:#0d9488; color:white; padding:10px 20px; border-radius:6px; text-decoration:none;">
        View Defect →
      </a>
    </div>
  `;

  const validRecipients = recipients.filter(Boolean);
  if (validRecipients.length === 0) return;

  try {
    await transporter.sendMail({
      from: `"Defect Tracker" <${process.env.SMTP_USER}>`,
      to: validRecipients.join(', '),
      subject,
      html,
    });
  } catch (err) {
    console.error('Email send error:', err.message);
  }
};

const sendDefectRaisedEmail = async ({ defect, raisedBy, recipients }) => {
  if (!recipients || recipients.length === 0) return;

  const transporter = createTransporter();
  const defectUrl = `${process.env.APP_BASE_URL}/defects/${defect.id}`;

  const subject = `[New Defect #${defect.id}] ${defect.title}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1e293b;">New Defect Raised</h2>
      <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 16px 0;">
        <h3 style="margin: 0 0 12px;">${defect.title}</h3>
        <p style="margin: 4px 0;"><strong>Defect #:</strong> ${defect.id}</p>
        <p style="margin: 4px 0;"><strong>Raised By:</strong> ${raisedBy}</p>
        <p style="margin: 4px 0;"><strong>Severity:</strong> ${defect.severity}</p>
        <p style="margin: 4px 0;"><strong>Environment:</strong> ${defect.environment}</p>
        <p style="margin: 4px 0;"><strong>Assigned Team:</strong> ${defect.assigned_team?.toUpperCase()}</p>
      </div>
      <a href="${defectUrl}" style="display:inline-block; background:#0d9488; color:white; padding:10px 20px; border-radius:6px; text-decoration:none;">
        View Defect →
      </a>
    </div>
  `;

  const validRecipients = recipients.filter(Boolean);
  if (validRecipients.length === 0) return;

  try {
    await transporter.sendMail({
      from: `"Defect Tracker" <${process.env.SMTP_USER}>`,
      to: validRecipients.join(', '),
      subject,
      html,
    });
  } catch (err) {
    console.error('Email send error:', err.message);
  }
};

module.exports = { sendStatusChangeEmail, sendDefectRaisedEmail };
