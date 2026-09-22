import type { Request, Response } from "express";
import { Router } from "express";

import { getAdminClient } from "../lib/db";
import {
  initializePaystackTransaction,
  isValidPaystackSignature,
  makeOrderReference,
  verifyPaystackTransaction
} from "../lib/paystack";
import { findShopProduct, nairaToKobo, shopProducts } from "../lib/shopCatalog";
import { auth } from "../middleware/auth";

const shopRouter = Router();

type ShopOrderRow = {
  id: string;
  reference: string;
  product_slug: string;
  product_name: string;
  colour: string;
  size: string | null;
  quantity: number;
  unit_price_kobo: number;
  amount_kobo: number;
  currency: string;
  full_name: string;
  email: string;
  phone: string;
  delivery_address: string;
  status: "pending" | "paid" | "failed" | "abandoned";
  paystack_access_code: string | null;
  paystack_authorization_url: string | null;
  paid_at: string | null;
  created_at: string;
};

type CheckoutBody = {
  productSlug?: string;
  product_slug?: string;
  colour?: string;
  color?: string;
  size?: string;
  quantity?: number | string;
  fullName?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  deliveryAddress?: string;
  delivery_address?: string;
  callbackUrl?: string;
  callback_url?: string;
};

type PaystackWebhookEvent = {
  event?: string;
  data?: {
    status?: string;
    reference?: string;
    amount?: number;
    paid_at?: string;
    paidAt?: string;
  };
};

type RawBodyRequest = Request & { rawBody?: Buffer };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const orderSelect =
  "id, reference, product_slug, product_name, colour, size, quantity, unit_price_kobo, amount_kobo, currency, full_name, email, phone, delivery_address, status, paystack_access_code, paystack_authorization_url, paid_at, created_at";

const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const toPublicOrder = (row: ShopOrderRow) => ({
  id: row.id,
  reference: row.reference,
  productSlug: row.product_slug,
  productName: row.product_name,
  colour: row.colour,
  size: row.size,
  quantity: row.quantity,
  unitPriceNaira: row.unit_price_kobo / 100,
  amountNaira: row.amount_kobo / 100,
  currency: row.currency,
  fullName: row.full_name,
  email: row.email,
  phone: row.phone,
  deliveryAddress: row.delivery_address,
  status: row.status,
  authorizationUrl: row.paystack_authorization_url,
  paidAt: row.paid_at,
  createdAt: row.created_at
});

const getOrderByReference = async (reference: string): Promise<ShopOrderRow | null> => {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("shop_orders")
    .select(orderSelect)
    .eq("reference", reference)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as ShopOrderRow | null) ?? null;
};

const markOrderPaid = async (reference: string, amountKobo: number, paidAt?: string) => {
  const admin = getAdminClient();
  const order = await getOrderByReference(reference);

  if (!order) {
    throw new Error("Order not found for this payment reference");
  }

  if (order.status === "paid") {
    return order;
  }

  if (order.amount_kobo !== amountKobo) {
    throw new Error("Paid amount does not match the order total");
  }

  const { data, error } = await admin
    .from("shop_orders")
    .update({
      status: "paid",
      paid_at: paidAt || new Date().toISOString()
    })
    .eq("reference", reference)
    .select(orderSelect)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as ShopOrderRow;
};

const markOrderFailed = async (reference: string, status: "failed" | "abandoned") => {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("shop_orders")
    .update({ status })
    .eq("reference", reference)
    .neq("status", "paid")
    .select(orderSelect)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as ShopOrderRow | null;
};

shopRouter.get("/products", (_req: Request, res: Response): void => {
  res.status(200).json({
    data: shopProducts.map((product) => ({
      slug: product.slug,
      name: product.name,
      description: product.description,
      priceNaira: product.priceNaira,
      currency: "NGN",
      sizes: product.sizes,
      colours: product.colours
    }))
  });
});

shopRouter.post("/checkout", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as CheckoutBody;
  const productSlug = readString(body.productSlug || body.product_slug);
  const colourSlug = readString(body.colour || body.color).toLowerCase();
  const size = readString(body.size).toUpperCase();
  const quantityValue = Number(body.quantity ?? 1);
  const fullName = readString(body.fullName || body.full_name);
  const email = readString(body.email).toLowerCase();
  const phone = readString(body.phone);
  const deliveryAddress = readString(body.deliveryAddress || body.delivery_address);
  const callbackUrl = readString(body.callbackUrl || body.callback_url) || (process.env.PAYSTACK_CALLBACK_URL || "").trim();

  const product = findShopProduct(productSlug);

  if (!product) {
    res.status(400).json({ message: "Unknown product" });
    return;
  }

  const colour = product.colours.find((item) => item.slug === colourSlug);

  if (!colour) {
    res.status(400).json({ message: "Select a valid colour" });
    return;
  }

  if (product.sizes.length > 0 && !product.sizes.includes(size)) {
    res.status(400).json({ message: "Select a valid size" });
    return;
  }

  if (!Number.isInteger(quantityValue) || quantityValue < 1 || quantityValue > 20) {
    res.status(400).json({ message: "Quantity must be between 1 and 20" });
    return;
  }

  if (!fullName || !email || !phone || !deliveryAddress) {
    res.status(400).json({ message: "fullName, email, phone, and deliveryAddress are required" });
    return;
  }

  if (!emailPattern.test(email)) {
    res.status(400).json({ message: "Enter a valid email address" });
    return;
  }

  if (phone.replace(/\D/g, "").length < 7) {
    res.status(400).json({ message: "Enter a valid phone number" });
    return;
  }

  const unitPriceKobo = nairaToKobo(product.priceNaira);
  const amountKobo = unitPriceKobo * quantityValue;
  const reference = makeOrderReference();

  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("shop_orders")
      .insert({
        reference,
        product_slug: product.slug,
        product_name: product.name,
        colour: colour.name,
        size: product.sizes.length > 0 ? size : null,
        quantity: quantityValue,
        unit_price_kobo: unitPriceKobo,
        amount_kobo: amountKobo,
        currency: "NGN",
        full_name: fullName,
        email,
        phone,
        delivery_address: deliveryAddress,
        status: "pending"
      })
      .select(orderSelect)
      .single();

    if (error) {
      res.status(400).json({ message: error.message });
      return;
    }

    const checkout = await initializePaystackTransaction({
      email,
      amountKobo,
      reference,
      callbackUrl: callbackUrl || undefined,
      metadata: {
        orderId: (data as ShopOrderRow).id,
        productSlug: product.slug,
        fullName,
        phone,
        deliveryAddress
      }
    });

    const { data: updated, error: updateError } = await admin
      .from("shop_orders")
      .update({
        paystack_access_code: checkout.access_code,
        paystack_authorization_url: checkout.authorization_url
      })
      .eq("id", (data as ShopOrderRow).id)
      .select(orderSelect)
      .single();

    if (updateError) {
      res.status(400).json({ message: updateError.message });
      return;
    }

    res.status(201).json({
      message: "Checkout initialized",
      data: {
        ...toPublicOrder(updated as ShopOrderRow),
        accessCode: checkout.access_code,
        authorizationUrl: checkout.authorization_url
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start checkout";
    res.status(500).json({ message });
  }
});

shopRouter.get("/verify/:reference", async (req: Request, res: Response): Promise<void> => {
  const reference = readString(req.params.reference);

  if (!reference) {
    res.status(400).json({ message: "Payment reference is required" });
    return;
  }

  try {
    const payment = await verifyPaystackTransaction(reference);

    let order: ShopOrderRow;

    if (payment.status === "success") {
      order = await markOrderPaid(reference, payment.amount, payment.paid_at);
    } else if (payment.status === "failed") {
      order = (await markOrderFailed(reference, "failed")) ?? (await getOrderByReference(reference)) as ShopOrderRow;
    } else if (payment.status === "abandoned") {
      order = (await markOrderFailed(reference, "abandoned")) ?? (await getOrderByReference(reference)) as ShopOrderRow;
    } else {
      const existing = await getOrderByReference(reference);

      if (!existing) {
        res.status(404).json({ message: "Order not found" });
        return;
      }

      order = existing;
    }

    if (!order) {
      res.status(404).json({ message: "Order not found" });
      return;
    }

    res.status(200).json({
      message: order.status === "paid" ? "Payment confirmed" : "Payment not completed",
      data: toPublicOrder(order)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to verify payment";
    res.status(400).json({ message });
  }
});

shopRouter.post("/paystack/webhook", async (req: Request, res: Response): Promise<void> => {
  const signature = readString(req.header("x-paystack-signature"));
  const rawBody = (req as RawBodyRequest).rawBody;

  if (!rawBody || !signature || !isValidPaystackSignature(rawBody, signature)) {
    res.status(401).json({ message: "Invalid Paystack signature" });
    return;
  }

  const event = req.body as PaystackWebhookEvent;
  const reference = readString(event.data?.reference);
  const amount = Number(event.data?.amount);
  const paidAt = readString(event.data?.paid_at || event.data?.paidAt);

  if (!reference) {
    res.status(200).json({ received: true });
    return;
  }

  try {
    if (event.event === "charge.success" && event.data?.status === "success") {
      const payment = await verifyPaystackTransaction(reference);

      if (payment.status === "success") {
        await markOrderPaid(reference, payment.amount || amount, payment.paid_at || paidAt);
      }
    } else if (event.data?.status === "failed") {
      await markOrderFailed(reference, "failed");
    } else if (event.data?.status === "abandoned") {
      await markOrderFailed(reference, "abandoned");
    }

    res.status(200).json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    console.error(message);
    res.status(500).json({ message });
  }
});

shopRouter.get("/orders/:reference", async (req: Request, res: Response): Promise<void> => {
  const reference = readString(req.params.reference);

  if (!reference) {
    res.status(400).json({ message: "Order reference is required" });
    return;
  }

  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("shop_orders")
      .select(orderSelect)
      .eq("reference", reference)
      .maybeSingle();

    if (error) {
      res.status(400).json({ message: error.message });
      return;
    }

    if (!data) {
      res.status(404).json({ message: "Order not found" });
      return;
    }

    res.status(200).json({ data: toPublicOrder(data as ShopOrderRow) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch order";
    res.status(500).json({ message });
  }
});

shopRouter.get("/orders", auth, async (req: Request, res: Response): Promise<void> => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  const search = (req.query.search as string | undefined)?.trim();
  const status = (req.query.status as string | undefined)?.trim();
  const safePage = Math.max(page, 1);
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;

  try {
    const admin = getAdminClient();
    let query = admin
      .from("shop_orders")
      .select(orderSelect, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status && ["pending", "paid", "failed", "abandoned"].includes(status)) {
      query = query.eq("status", status);
    }

    if (search) {
      const safeSearch = search.replace(/[%*,()]/g, "").trim();
      if (safeSearch) {
        query = query.or(
          `full_name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%,reference.ilike.%${safeSearch}%,delivery_address.ilike.%${safeSearch}%`
        );
      }
    }

    const { data, error, count } = await query;

    if (error) {
      res.status(400).json({ message: error.message });
      return;
    }

    res.status(200).json({
      data: ((data ?? []) as ShopOrderRow[]).map(toPublicOrder),
      meta: {
        page: safePage,
        limit: safeLimit,
        total: count ?? 0
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch shop orders";
    res.status(500).json({ message });
  }
});

export { shopRouter };
