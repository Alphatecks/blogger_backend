import crypto from "crypto";

const paystackSecretKey = (process.env.PAYSTACK_SECRET_KEY || "").trim();
const paystackBaseUrl = "https://api.paystack.co";

if (paystackSecretKey.startsWith("sk_live_")) {
  console.log("Paystack mode: live");
} else if (paystackSecretKey.startsWith("sk_test_")) {
  console.warn("Paystack mode: test. Use sk_live_... for real charges.");
} else if (paystackSecretKey) {
  console.warn("Paystack secret key does not look like sk_live_ or sk_test_.");
}

export type PaystackInitializeResponse = {
  status: boolean;
  message: string;
  data?: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
};

export type PaystackVerifyResponse = {
  status: boolean;
  message: string;
  data?: {
    status: string;
    reference: string;
    amount: number;
    currency: string;
    paid_at?: string;
    customer?: {
      email?: string;
    };
    metadata?: Record<string, unknown>;
  };
};

const requireSecret = (): string => {
  if (!paystackSecretKey) {
    throw new Error("PAYSTACK_SECRET_KEY is required for shop payments");
  }

  return paystackSecretKey;
};

const paystackRequest = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const secret = requireSecret();
  const response = await fetch(`${paystackBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const payload = (await response.json()) as T & { message?: string; status?: boolean };

  if (!response.ok || payload.status === false) {
    throw new Error(payload.message || "Paystack request failed");
  }

  return payload;
};

export const initializePaystackTransaction = async (input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}): Promise<NonNullable<PaystackInitializeResponse["data"]>> => {
  const payload = await paystackRequest<PaystackInitializeResponse>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKobo,
      reference: input.reference,
      currency: "NGN",
      callback_url: input.callbackUrl || undefined,
      metadata: input.metadata
    })
  });

  if (!payload.data) {
    throw new Error("Paystack did not return checkout details");
  }

  return payload.data;
};

export const verifyPaystackTransaction = async (
  reference: string
): Promise<NonNullable<PaystackVerifyResponse["data"]>> => {
  const payload = await paystackRequest<PaystackVerifyResponse>(
    `/transaction/verify/${encodeURIComponent(reference)}`
  );

  if (!payload.data) {
    throw new Error("Paystack did not return verification details");
  }

  return payload.data;
};

export const isValidPaystackSignature = (rawBody: Buffer, signature: string): boolean => {
  const secret = requireSecret();
  const hash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  return hash === signature;
};

export const makeOrderReference = (): string => {
  const token = crypto.randomBytes(8).toString("hex");
  return `KS-${Date.now()}-${token}`;
};
