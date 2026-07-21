require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');

const app = express();

// In produzione, sostituisci '*' con il dominio esatto dove ospiti il file HTML
// es: origin: 'https://tuosito.it'
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json({ limit: '25mb' })); // il PDF in base64 può essere pesante

// Resend invia via API HTTP (porta 443), non via SMTP: nessun blocco di porte
// sui piani gratuiti di hosting come Render.
// RESEND_API_KEY si ottiene da resend.com dopo la registrazione.
const resend = new Resend(process.env.RESEND_API_KEY);

// RESEND_FROM_EMAIL deve essere un indirizzo sul dominio verificato su Resend,
// es. "Universitalia <info@universitaliasrl.it>" (richiede di aver verificato
// il dominio universitaliasrl.it nel pannello Resend con i record DNS forniti).
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Universitalia <onboarding@resend.dev>';

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

    const emailPayload = {
      from: FROM_EMAIL,
      to: [to],
      subject: subject || 'Preventivo Tesi - Universitalia',
      text: body || '',
      attachments: [
        {
          filename: pdfFilename || 'preventivo.pdf',
          content: pdfBase64, // Resend accetta il contenuto base64 come stringa
        },
      ],
    };

    if (cc && typeof cc === 'string' && cc.trim()) {
      emailPayload.cc = [cc.trim()];
    }

    const { data, error } = await resend.emails.send(emailPayload);

    if (error) {
      console.error('❌ Errore invio email (Resend):', error);
      return res.status(500).json({ error: error.message || 'Errore invio email' });
    }

    console.log('✅ Email inviata:', data.id, '-> a:', to);
    res.json({ success: true, messageId: data.id });
  } catch (err) {
    console.error('❌ Errore invio email:', err);
    res.status(500).json({ error: err.message || 'Errore interno invio email' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Server email (Resend) in ascolto sulla porta ${PORT}`));
