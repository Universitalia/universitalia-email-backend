require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();

// In produzione, sostituisci '*' con il dominio esatto dove ospiti il file HTML
// es: origin: 'https://universitalia-email-backend.onrender.com'
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json({ limit: '25mb' })); // il PDF in base64 può essere pesante

// Transporter Gmail SMTP
// GMAIL_USER = info@universitaliasrl.it
// GMAIL_APP_PASSWORD = Password per le App generata da account.google.com/apppasswords
// (richiede 2FA attiva sull'account Gmail/Google Workspace)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,info@universitaliasrl.it
    pass: process.env.GMAIL_APP_PASSWORD=grfsdhlacwslipby
  },
});

// Verifica connessione SMTP all'avvio (utile per debug in log)
transporter.verify((err) => {
  if (err) console.error('❌ Connessione SMTP fallita:', err.message);
  else console.log('✅ Connessione SMTP Gmail attiva, pronto a inviare email');
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/send-email', async (req, res) => {
  try {
    const { to, cc, subject, body, pdfBase64, pdfFilename } = req.body;

    if (!to || typeof to !== 'string') {
      return res.status(400).json({ error: 'Destinatario (to) mancante o non valido' });
    }
    if (!pdfBase64) {
      return res.status(400).json({ error: 'PDF allegato mancante' });
    }

    const mailOptions = {
      from: `"Universitalia" <${process.env.GMAIL_USER}>`,
      to,
      subject: subject || 'Preventivo Tesi - Universitalia',
      text: body || '',
      attachments: [
        {
          filename: pdfFilename || 'preventivo.pdf',
          content: pdfBase64,
          encoding: 'base64',
        },
      ],
    };

    if (cc && typeof cc === 'string' && cc.trim()) {
      mailOptions.cc = cc.trim();
    }

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email inviata:', info.messageId, '-> a:', to);
    res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error('❌ Errore invio email:', err);
    res.status(500).json({ error: err.message || 'Errore interno invio email' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Server email in ascolto sulla porta ${PORT}`));
