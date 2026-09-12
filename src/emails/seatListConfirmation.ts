export type SeatListMailInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  occupation: string;
  comingFrom: string;
  seatCode: string;
  logoUrl: string;
  siteUrl: string;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const makeSeatCode = (firstName: string, lastName: string): string => {
  const first = (firstName.trim()[0] || "K").toUpperCase();
  const last = (lastName.trim()[0] || "S").toUpperCase();
  const n = String(((firstName.trim().length * 13) + (lastName.trim().length * 7) + 26) % 90 + 10);
  return `RR26 ${first}${last}${n}`;
};

export const buildSeatListConfirmation = (input: SeatListMailInput): { subject: string; html: string; text: string } => {
  const firstName = escapeHtml(input.firstName);
  const fullName = escapeHtml(`${input.firstName} ${input.lastName}`.replace(/\s+/g, " ").trim());
  const email = escapeHtml(input.email);
  const phone = escapeHtml(input.phone);
  const occupation = escapeHtml(input.occupation);
  const comingFrom = escapeHtml(input.comingFrom);
  const seatCode = escapeHtml(input.seatCode);
  const logoUrl = escapeHtml(input.logoUrl);
  const siteUrl = escapeHtml(input.siteUrl);
  const subject = `${input.firstName}, your name is on the list`;

  const text = [
    "KAIROS SUMMIT  SEAT LIST  PORT HARCOURT",
    "",
    `${input.firstName}, your name is on the list.`,
    "",
    "On the door list",
    `${input.firstName} ${input.lastName}`.replace(/\s+/g, " ").trim(),
    `Seat ${input.seatCode}`,
    "",
    "Saturday 14 November, 8:30 in the morning. Celebr8 Centre, Olu Obasanjo Road.",
    `If the plan shifts, we will write ${input.email}.`,
    "",
    `Phone  ${input.phone}`,
    `Coming from  ${input.comingFrom}`,
    `Occupation  ${input.occupation}`,
    "",
    "Doors from 8:30. Come early if you want a seat near the front.",
    "Last June this hall filled up. Keep this note. It is how we know you at the door.",
    "",
    siteUrl.replace(/^https?:\/\//, "")
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <title>${subject}</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;600;700&display=swap" rel="stylesheet">
  <!--[if mso]>
  <style type="text/css">
    body, table, td, a, p, h1, span { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#efe6d4;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    Saturday 14 November, 8:30 in the morning at Celebr8 Centre.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#efe6d4;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:28px 16px 40px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#efe6d4;">
          <tr>
            <td style="background-color:#14080c;padding:28px 36px 24px;text-align:left;">
              <img src="${logoUrl}" alt="Kairos Summit" width="196" style="display:block;width:196px;max-width:70%;height:auto;border:0;">
            </td>
          </tr>
          <tr>
            <td style="background-color:#14080c;padding:0 36px 26px;">
              <p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4;font-weight:600;color:#f6efe4;">
                Celebr8 Centre, Olu Obasanjo Road
              </p>
              <p style="margin:6px 0 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;font-weight:600;letter-spacing:0.04em;color:#FABD21;">
                Saturday 14 November 2026 &nbsp;&middot;&nbsp; 8:30 AM
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#efe6d4;padding:36px 36px 8px;">
              <p style="margin:0 0 18px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:11px;line-height:1.4;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#8a6a2a;">
                Kairos Summit &nbsp;&middot;&nbsp; Seat list &nbsp;&middot;&nbsp; Port Harcourt
              </p>
              <p style="margin:0 0 16px;width:54px;height:3px;background-color:#FABD21;font-size:0;line-height:0;">&nbsp;</p>
              <h1 style="margin:0 0 10px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:36px;line-height:1.05;font-weight:700;letter-spacing:-0.03em;color:#550E1E;">
                ${firstName}, your name is on the list.
              </h1>
              <p style="margin:0 0 28px;max-width:420px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;font-weight:500;color:#4a3530;">
                This is the list we will use at Celebr8, not WhatsApp, not a story reply. Keep this note. It is how we know you at the door.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #d8c7aa;background-color:#fffaf0;">
                <tr>
                  <td style="background-color:#550E1E;padding:16px 22px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:15px;line-height:1.3;font-weight:700;color:#fffaf0;">
                          Remnants Reborn
                        </td>
                        <td align="right" style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13px;line-height:1.3;font-weight:700;letter-spacing:0.08em;color:#FABD21;">
                          ${seatCode}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:22px 22px 20px;background-color:#fffaf0;">
                    <p style="margin:0 0 6px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:11px;line-height:1.3;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#8a6a2a;">
                      On the door list
                    </p>
                    <p style="margin:0 0 12px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:28px;line-height:1.1;font-weight:700;letter-spacing:-0.03em;color:#550E1E;">
                      ${fullName}
                    </p>
                    <p style="margin:0 0 20px;max-width:420px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;font-weight:500;color:#4a3530;">
                      Saturday 14 November, 8:30 in the morning. Celebr8 Centre, Olu Obasanjo Road. If the plan shifts, we will write ${email}.
                    </p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="50%" valign="top" style="padding:0 12px 0 0;">
                          <p style="margin:0 0 4px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:11px;line-height:1.3;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#8a6a2a;">Phone</p>
                          <p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:15px;line-height:1.4;font-weight:600;color:#550E1E;">${phone}</p>
                        </td>
                        <td width="50%" valign="top" style="padding:0;">
                          <p style="margin:0 0 4px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:11px;line-height:1.3;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#8a6a2a;">Coming from</p>
                          <p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:15px;line-height:1.4;font-weight:600;color:#550E1E;">${comingFrom}</p>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" valign="top" style="padding:16px 0 0;">
                          <p style="margin:0 0 4px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:11px;line-height:1.3;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#8a6a2a;">Occupation</p>
                          <p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:15px;line-height:1.4;font-weight:600;color:#550E1E;">${occupation}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin:22px 0 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;font-weight:500;color:#6a5344;">
                Doors from 8:30. Come early if you want a seat near the front.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#efe6d4;padding:28px 36px 8px;">
              <p style="margin:0;width:100%;height:1px;background-color:#d8c7aa;font-size:0;line-height:0;">&nbsp;</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#efe6d4;padding:16px 36px 12px;">
              <p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#8a6a2a;">
                <a href="${siteUrl}" style="color:#8a6a2a;text-decoration:none;">kairosummit.org</a>
              </p>
              <p style="margin:8px 0 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6a5344;">
                A note from the Kairos Summit house, Port Harcourt.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
};
