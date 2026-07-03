const { App, ExpressReceiver } = require('@slack/bolt');
const pool = require('../db/pool');
const { sendDefectRaisedEmail } = require('./email');

let slackApp = null;
let slackReceiver = null;

const initSlack = () => {
  const token = process.env.SLACK_BOT_TOKEN;
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!token || !secret || token.startsWith('xoxb-your') || secret === 'your-slack-signing-secret') {
    console.warn('⚠️  Slack credentials not configured — Slack integration disabled');
    return { app: null, receiver: null };
  }

  slackReceiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    endpoints: '/slack/events',
  });

  slackApp = new App({
    token: process.env.SLACK_BOT_TOKEN,
    receiver: slackReceiver,
  });

  // /raise-defect slash command
  slackApp.command('/raise-defect', async ({ ack, client, body }) => {
    await ack();
    try {
      const projects = await pool.query('SELECT id, name FROM projects ORDER BY name');
      const projectOptions = projects.rows.map(p => ({
        text: { type: 'plain_text', text: p.name },
        value: String(p.id),
      }));

      await client.views.open({
        trigger_id: body.trigger_id,
        view: {
          type: 'modal',
          callback_id: 'raise_defect_modal',
          title: { type: 'plain_text', text: 'Raise a Defect' },
          submit: { type: 'plain_text', text: 'Submit' },
          close: { type: 'plain_text', text: 'Cancel' },
          blocks: [
            {
              type: 'input',
              block_id: 'title_block',
              label: { type: 'plain_text', text: 'Title' },
              element: { type: 'plain_text_input', action_id: 'title_input', placeholder: { type: 'plain_text', text: 'Defect title...' } },
            },
            {
              type: 'input',
              block_id: 'project_block',
              label: { type: 'plain_text', text: 'Project' },
              element: {
                type: 'static_select',
                action_id: 'project_select',
                placeholder: { type: 'plain_text', text: 'Select project' },
                options: projectOptions,
              },
            },
            {
              type: 'input',
              block_id: 'env_block',
              label: { type: 'plain_text', text: 'Environment' },
              element: {
                type: 'static_select',
                action_id: 'env_select',
                placeholder: { type: 'plain_text', text: 'Select environment' },
                options: [
                  { text: { type: 'plain_text', text: 'SIT' }, value: 'SIT' },
                  { text: { type: 'plain_text', text: 'UAT' }, value: 'UAT' },
                  { text: { type: 'plain_text', text: 'PROD' }, value: 'PROD' },
                ],
              },
            },
            {
              type: 'input',
              block_id: 'severity_block',
              label: { type: 'plain_text', text: 'Severity' },
              element: {
                type: 'static_select',
                action_id: 'severity_select',
                placeholder: { type: 'plain_text', text: 'Select severity' },
                options: [
                  { text: { type: 'plain_text', text: 'Sev1 - Critical' }, value: 'Sev1' },
                  { text: { type: 'plain_text', text: 'Sev2 - Major' }, value: 'Sev2' },
                  { text: { type: 'plain_text', text: 'Sev3 - Minor' }, value: 'Sev3' },
                  { text: { type: 'plain_text', text: 'Observation' }, value: 'Observation' },
                ],
              },
            },
            {
              type: 'input',
              block_id: 'team_block',
              label: { type: 'plain_text', text: 'Assign to Team' },
              element: {
                type: 'static_select',
                action_id: 'team_select',
                placeholder: { type: 'plain_text', text: 'Select team' },
                options: [
                  { text: { type: 'plain_text', text: 'Dev' }, value: 'dev' },
                  { text: { type: 'plain_text', text: 'FMW' }, value: 'fmw' },
                  { text: { type: 'plain_text', text: 'Mobility' }, value: 'mobility' },
                ],
              },
            },
            {
              type: 'input',
              block_id: 'steps_block',
              label: { type: 'plain_text', text: 'Steps to Reproduce' },
              element: {
                type: 'plain_text_input',
                action_id: 'steps_input',
                multiline: true,
                placeholder: { type: 'plain_text', text: 'Describe steps to reproduce...' },
              },
              optional: true,
            },
          ],
        },
      });
    } catch (err) {
      console.error('Slack modal open error:', err);
    }
  });

  // Modal submission handler
  slackApp.view('raise_defect_modal', async ({ ack, view, client, body }) => {
    await ack();
    try {
      const vals = view.state.values;
      const title = vals.title_block.title_input.value;
      const projectId = vals.project_block.project_select.selected_option.value;
      const environment = vals.env_block.env_select.selected_option.value;
      const severity = vals.severity_block.severity_select.selected_option.value;
      const assignedTeam = vals.team_block.team_select.selected_option.value;
      const steps = vals.steps_block?.steps_input?.value || '';
      const slackUserId = body.user.id;

      // Match slack user to system user
      const userResult = await pool.query('SELECT id FROM users WHERE slack_user_id = $1', [slackUserId]);
      const raisedByUserId = userResult.rows[0]?.id || null;

      const defectResult = await pool.query(`
        INSERT INTO defects (title, project_id, environment, severity, steps_to_reproduce, status, assigned_team, raised_by_user_id)
        VALUES ($1, $2, $3, $4, $5, 'Open', $6, $7)
        RETURNING *
      `, [title, projectId, environment, severity, steps, assignedTeam, raisedByUserId]);

      const defect = defectResult.rows[0];

      if (raisedByUserId) {
        await pool.query(`
          INSERT INTO audit_log (defect_id, changed_by_user_id, old_status, new_status, note)
          VALUES ($1, $2, NULL, 'Open', 'Raised via Slack /raise-defect')
        `, [defect.id, raisedByUserId]);
      }

      const defectUrl = `${process.env.APP_BASE_URL}/defects/${defect.id}`;

      await client.chat.postMessage({
        channel: body.user.id,
        text: `✅ Defect #${defect.id} raised successfully!\n*${title}*\n<${defectUrl}|View Defect>`,
      });

      await sendSlackChannelNotification({
        defect,
        message: `🐛 New Defect #${defect.id} raised via Slack`,
        changedBy: body.user.name,
        defectUrl,
      });

    } catch (err) {
      console.error('Slack modal submit error:', err);
    }
  });

  console.log('✅ Slack integration initialized');
  return { app: slackApp, receiver: slackReceiver };
};

const sendSlackChannelNotification = async ({ defect, message, changedBy, defectUrl, oldStatus, newStatus }) => {
  if (!slackApp || !process.env.SLACK_CHANNEL_ID) return;

  try {
    const url = defectUrl || `${process.env.APP_BASE_URL}/defects/${defect.id}`;
    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${message}\n*<${url}|${defect.title}>*`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Severity:*\n${defect.severity}` },
          { type: 'mrkdwn', text: `*Environment:*\n${defect.environment}` },
          ...(oldStatus && newStatus ? [{ type: 'mrkdwn', text: `*Status:*\n~${oldStatus}~ → *${newStatus}*` }] : []),
          { type: 'mrkdwn', text: `*Changed by:*\n${changedBy}` },
        ],
      },
    ];

    await slackApp.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: process.env.SLACK_CHANNEL_ID,
      text: message,
      blocks,
    });
  } catch (err) {
    console.error('Slack notification error:', err.message);
  }
};

module.exports = { initSlack, sendSlackChannelNotification };
