import { Resend } from "resend";

import {
  buildSeatListConfirmation,
  makeSeatCode,
  type SeatListMailInput
} from "../emails/seatListConfirmation";

const resendApiKey = (process.env.RESEND_API_KEY || "").trim();
const resendFrom = (process.env.RESEND_FROM || "Kairos Summit <event@kairosummit.org>").trim();
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || "https://blogger-backend-km7w.onrender.com").replace(
  /\/+$/,
  ""
);
const emailLogoUrl = (process.env.EMAIL_LOGO_URL || `${publicBaseUrl}/brand/logo.png`).trim();
const siteUrl = (process.env.KAIROS_SITE_URL || "https://kairosummit.org").replace(/\/+$/, "");

const resend = resendApiKey ? new Resend(resendApiKey) : null;

export const sendSeatListConfirmation = async (
  input: Omit<SeatListMailInput, "seatCode" | "logoUrl" | "siteUrl"> & { seatCode?: string }
): Promise<boolean> => {
  if (!resend) {
    console.warn("RESEND_API_KEY is missing. Seat list mail was not sent.");
    return false;
  }

  const seatCode = input.seatCode || makeSeatCode(input.firstName, input.lastName);
  const message = buildSeatListConfirmation({
    ...input,
    seatCode,
    logoUrl: emailLogoUrl,
    siteUrl
  });

  const { error } = await resend.emails.send({
    from: resendFrom,
    to: input.email,
    subject: message.subject,
    html: message.html,
    text: message.text
  });

  if (error) {
    throw new Error(error.message);
  }

  return true;
};

export { makeSeatCode };
