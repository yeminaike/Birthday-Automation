require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { google } = require('googleapis');
const cron = require('node-cron');

const CREDENTIALS = require('./credentials.json');
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE'; // ← Change this!

const auth = new google.auth.JWT(
  CREDENTIALS.client_email,
  null,
  CREDENTIALS.private_key.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/spreadsheets']
);
const sheets = google.sheets({ version: 'v4', auth });

const client = new Client({
  authStrategy: new LocalAuth({ clientId: "birthday-bot" }),
  puppeteer: { 
    headless: false,           // Keep browser visible
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', (qr) => {
  console.log('📱 Scan this QR code with WhatsApp on your phone:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ WhatsApp is ready! Keep this window open.');
});

client.on('auth_failure', msg => console.error('Auth failure:', msg));

client.initialize();

// Get data from Google Sheets
async function getBirthdays() {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:D',   // Adjust if your sheet name is different
    });
    return response.data.values || [];
  } catch (err) {
    console.error('Google Sheets Error:', err);
    return [];
  }
}

// Check and type birthday messages
async function checkBirthdays() {
  console.log('🔍 Checking for birthdays today...');
  const rows = await getBirthdays();
  const today = new Date();
  const currentDate = `${today.getDate().toString().padStart(2, '0')}-${(today.getMonth() + 1).toString().padStart(2, '0')}`;
  const currentYear = today.getFullYear();

  let found = false;

  for (let i = 1; i < rows.length; i++) {
    const [name, phone, birthday, sentYear] = rows[i];
    if (!name || !phone || !birthday) continue;

    if (birthday === currentDate && sentYear != currentYear) {
      found = true;
      const chatId = `${phone.replace('+', '')}@c.us`; // Clean phone number
      const defaultMessage = `🎉 Happy Birthday, ${name}! Wishing you a fantastic year filled with joy! 🎂`;

      try {
        const chat = await client.getChatById(chatId);
        await chat.open(); // Focus/open the chat

        // Type slowly so it looks human
        const inputBox = await client.pupPage.$('div[role="textbox"]');
        if (inputBox) {
          await inputBox.type(defaultMessage, { delay: 60 });
          console.log(`✍️ Typed message for ${name} (${phone}). Now REVIEW & SEND manually!`);
        } else {
          console.log(`⚠️ Could not find input box for ${name}. Switch to WhatsApp window and paste manually.`);
        }
      } catch (err) {
        console.error(`Failed to open chat for ${name}:`, err.message);
      }
    }
  }

  if (!found) {
    console.log('No birthdays today.');
  }
}



// Schedule daily check at 8:00 AM (Nigeria time)
cron.schedule('0 8 * * *', checkBirthdays, { timezone: "Africa/Lagos" });

// Manual trigger: just type "check" in terminal and press Enter
console.log('\n💡 Type "check" in this terminal anytime to run manually.\n');

process.stdin.on('data', (data) => {
  if (data.toString().trim().toLowerCase() === 'check') {
    checkBirthdays();
  }
});