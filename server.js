require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();

// In produzione, sostituisci '*' con il dominio esatto dove ospiti il file HTML
// es: origin: 'https://tuosito.it'
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json({ limit: '40mb' })); // due PDF in base64 (modulo + tesi) possono essere pesanti

// Transporter Gmail SMTP
// GMAIL_USER = info@universitaliasrl.it
// GMAIL_APP_PASSWORD = Password per le App generata da account.google.com/apppasswords
// (richiede 2FA attiva sull'account Gmail/Google Workspace)
//
// NB: su Render, "service: 'gmail'" può causare Connection timeout perché
// Render a volte instrada la connessione su IPv6, che Gmail SMTP non gestisce
// bene. Qui si usa host/porta espliciti e si forza IPv4 (family: 4).
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // true per la porta 465 (SSL diretto)
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  family: 4, // forza IPv4, evita i timeout dovuti a IPv6 su Render
  connectionTimeout: 20000, // 20s invece del default (spesso troppo corto su free tier)
  greetingTimeout: 20000,
  socketTimeout: 20000,
});

// Verifica connessione SMTP all'avvio (utile per debug in log)
transporter.verify((err) => {
  if (err) console.error('❌ Connessione SMTP (porta 465) fallita:', err.message);
  else console.log('✅ Connessione SMTP Gmail attiva (porta 465), pronto a inviare email');
});

// Transporter di riserva sulla porta 587 (STARTTLS), usato automaticamente
// come fallback se l'invio sulla 465 va in timeout.
const transporterFallback = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // STARTTLS
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  family: 4,
  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 20000,
});

async function sendMailWithFallback(mailOptions) {
  try {
    return await transporter.sendMail(mailOptions);
  } catch (err) {
    console.warn('⚠️ Invio su porta 465 fallito (' + err.message + '), riprovo su porta 587...');
    return await transporterFallback.sendMail(mailOptions);
  }
}

app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/send-email', async (req, res) => {
  try {
    const { to, cc, subject, body, attachments, pdfBase64, pdfFilename } = req.body;

    if (!to || typeof to !== 'string') {
      return res.status(400).json({ error: 'Destinatario (to) mancante o non valido' });
    }

    // Formato nuovo: array "attachments" con più file (es. modulo + PDF tesi caricato).
    // Formato legacy: singolo "pdfBase64"/"pdfFilename", mantenuto per compatibilità.
    let finalAttachments = [];
    if (Array.isArray(attachments) && attachments.length > 0) {
      finalAttachments = attachments
        .filter(a => a && a.content)
        .map(a => ({
          filename: a.filename || 'allegato.pdf',
          content: a.content,
          encoding: 'base64',
        }));
    } else if (pdfBase64) {
      finalAttachments = [{
        filename: pdfFilename || 'preventivo.pdf',
        content: pdfBase64,
        encoding: 'base64',
      }];
    }

    if (finalAttachments.length === 0) {
      return res.status(400).json({ error: 'Nessun allegato valido fornito' });
    }

    const mailOptions = {
      from: `"Universitalia" <${process.env.GMAIL_USER}>`,
      to,
      subject: subject || 'Preventivo Tesi - Universitalia',
      text: body || '',
      attachments: finalAttachments,
    };

    if (cc && typeof cc === 'string' && cc.trim()) {
      mailOptions.cc = cc.trim();
    }

    const info = await sendMailWithFallback(mailOptions);
    console.log('✅ Email inviata:', info.messageId, '-> a:', to, '(' + finalAttachments.length + ' allegati)');
    res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error('❌ Errore invio email:', err);
    res.status(500).json({ error: err.message || 'Errore interno invio email' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Server email in ascolto sulla porta ${PORT}`));
