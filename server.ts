import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RECIPIENT_EMAIL = 'bdbishal72@gmail.com';
const PORT = 3000;

interface NotifyLocationBody {
  displayName?: string;
  senderEmail?: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
  circleName?: string;
  circleId?: string;
  mapsUrl?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, recipient: RECIPIENT_EMAIL });
  });

  app.post('/api/notify-location', async (req, res) => {
    try {
      const body = (req.body ?? {}) as NotifyLocationBody;
      const lat = typeof body.lat === 'number' && Number.isFinite(body.lat) ? body.lat : null;
      const lng = typeof body.lng === 'number' && Number.isFinite(body.lng) ? body.lng : null;

      if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({
          sent: false,
          error: 'Valid latitude and longitude coordinates are required.',
        });
      }

      const displayName = (body.displayName || 'Wayfinder User').slice(0, 80);
      const senderEmail = (body.senderEmail || 'user@wayfinder.app').slice(0, 160);
      const accuracy =
        typeof body.accuracy === 'number' && Number.isFinite(body.accuracy) ? body.accuracy : 0;
      const circleName = (body.circleName || 'Direct Share').slice(0, 60);
      const circleId = (body.circleId || 'DIRECT').slice(0, 64);
      const mapsUrl = `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
      const timestampIso = new Date().toISOString();

      const subject = `Wayfinder Live Location Alert — ${displayName}`;
      const textBody = [
        `${displayName} (${senderEmail}) granted live location permission on Wayfinder.`,
        '',
        `Google Maps Link: ${mapsUrl}`,
        `Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        `GPS Accuracy: ±${Math.round(accuracy)} m`,
        `Friend Circle: ${circleName} (${circleId})`,
        `Timestamp (UTC): ${timestampIso}`,
      ].join('\n');

      const htmlBody = `
        <div style="font-family: sans-serif; color: #0f172a; line-height: 1.5;">
          <h2 style="margin: 0 0 12px;">Live Location Permission Granted</h2>
          <p><strong>${escapeHtml(displayName)}</strong> (${escapeHtml(senderEmail)}) shared their live location on Wayfinder.</p>
          <p style="margin: 16px 0;">
            <a href="${mapsUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">
              Open Location in Google Maps
            </a>
          </p>
          <p style="font-size: 13px; color: #475569;">
            Direct Link: <a href="${mapsUrl}">${mapsUrl}</a><br/>
            Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)} (±${Math.round(accuracy)} m)<br/>
            Friend Circle: ${escapeHtml(circleName)} (${escapeHtml(circleId)})<br/>
            Timestamp: ${timestampIso}
          </p>
        </div>
      `;

      const mailtoUrl = `mailto:${RECIPIENT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(textBody)}`;

      // 1. Primary: EmailJS REST API
      const emailjsServiceId =
        process.env.EMAILJS_SERVICE_ID || process.env.VITE_EMAILJS_SERVICE_ID;
      const emailjsTemplateId =
        process.env.EMAILJS_TEMPLATE_ID || process.env.VITE_EMAILJS_TEMPLATE_ID;
      const emailjsPublicKey =
        process.env.EMAILJS_PUBLIC_KEY || process.env.VITE_EMAILJS_PUBLIC_KEY;
      const emailjsPrivateKey = process.env.EMAILJS_PRIVATE_KEY;

      if (emailjsServiceId && emailjsTemplateId && emailjsPublicKey) {
        const emailjsPayload: Record<string, unknown> = {
          service_id: emailjsServiceId,
          template_id: emailjsTemplateId,
          user_id: emailjsPublicKey,
          template_params: {
            email: RECIPIENT_EMAIL,
            to: RECIPIENT_EMAIL,
            to_mail: RECIPIENT_EMAIL,
            to_email: RECIPIENT_EMAIL,
            recipient: RECIPIENT_EMAIL,
            recipient_email: RECIPIENT_EMAIL,
            to_name: 'Bishal',
            from_name: displayName,
            from_email: senderEmail,
            reply_to: senderEmail,
            user_name: displayName,
            user_email: senderEmail,
            subject,
            maps_url: mapsUrl,
            location_link: mapsUrl,
            google_maps_link: mapsUrl,
            latitude: lat.toFixed(6),
            longitude: lng.toFixed(6),
            accuracy: `±${Math.round(accuracy)} m`,
            circle_name: circleName,
            circle_id: circleId,
            timestamp: timestampIso,
            message: textBody,
          },
        };

        if (emailjsPrivateKey) {
          emailjsPayload.accessToken = emailjsPrivateKey;
        }

        const emailjsRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(emailjsPayload),
        });

        if (emailjsRes.ok) {
          return res.json({
            sent: true,
            deliveryMethod: 'emailjs',
            recipient: RECIPIENT_EMAIL,
            mapsUrl,
            mailtoUrl,
          });
        }

        const emailjsErr = await emailjsRes.text();
        if (emailjsRes.status === 403) {
          // Non-browser API access is disabled in EmailJS dashboard; delegate cleanly to @emailjs/browser
          return res.status(200).json({
            sent: false,
            useBrowserEmailJs: true,
            emailjsBrowserConfig: {
              serviceId: emailjsServiceId,
              templateId: emailjsTemplateId,
              publicKey: emailjsPublicKey,
            },
            deliveryMethod: 'emailjs',
            recipient: RECIPIENT_EMAIL,
            mapsUrl,
            mailtoUrl,
          });
        }

        console.warn('EmailJS server send failed:', emailjsRes.status, emailjsErr);
      }

      // 2. Secondary: Resend API (if configured)
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM || 'Wayfinder <onboarding@resend.dev>',
            to: [RECIPIENT_EMAIL],
            subject,
            text: textBody,
            html: htmlBody,
          }),
        });

        if (resendRes.ok) {
          const resendData = (await resendRes.json()) as { id?: string };
          return res.json({
            sent: true,
            deliveryMethod: 'resend',
            recipient: RECIPIENT_EMAIL,
            mapsUrl,
            messageId: resendData.id || null,
            mailtoUrl,
          });
        }
        console.warn('Resend send failed:', resendRes.status, await resendRes.text());
      }

      // 3. Tertiary: SMTP / Gmail App Password (if configured)
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpHost = process.env.SMTP_HOST || (smtpUser && smtpPass ? 'smtp.gmail.com' : '');
      if (smtpHost && smtpUser && smtpPass) {
        const port = Number(process.env.SMTP_PORT || 465);
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port,
          secure: port === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });

        const info = await transporter.sendMail({
          from: process.env.SMTP_FROM || smtpUser,
          to: RECIPIENT_EMAIL,
          subject,
          text: textBody,
          html: htmlBody,
        });

        return res.json({
          sent: true,
          deliveryMethod: 'smtp',
          recipient: RECIPIENT_EMAIL,
          mapsUrl,
          messageId: info.messageId,
          mailtoUrl,
        });
      }

      // 4. Fallback: Return mailto URL (and public EmailJS browser config if present)
      return res.status(200).json({
        sent: false,
        useBrowserEmailJs: Boolean(emailjsServiceId && emailjsTemplateId && emailjsPublicKey),
        emailjsBrowserConfig:
          emailjsServiceId && emailjsTemplateId && emailjsPublicKey
            ? {
                serviceId: emailjsServiceId,
                templateId: emailjsTemplateId,
                publicKey: emailjsPublicKey,
              }
            : null,
        deliveryMethod: 'mailto_fallback',
        recipient: RECIPIENT_EMAIL,
        mapsUrl,
        mailtoUrl,
        reason:
          'Configure EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, and EMAILJS_PUBLIC_KEY in Secrets to send automatically via EmailJS.',
      });
    } catch (error) {
      console.error('Error in /api/notify-location:', error);
      return res.status(500).json({
        sent: false,
        error: 'Failed to process location email notification.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Wayfinder server listening on http://0.0.0.0:${PORT}`);
  });
}

createServer();
