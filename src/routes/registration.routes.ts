import type { Request, Response } from "express";
import { Router } from "express";

import { getAdminClient } from "../lib/db";
import { auth } from "../middleware/auth";

const registrationRouter = Router();

const eventSlug = (process.env.KAIROS_EVENT_SLUG || "remnants-reborn-2026").trim();

const eventInfo = {
  slug: eventSlug,
  name: "Remnants Reborn",
  presenter: "Kairos Summit",
  date: "2026-11-14",
  time: "08:30",
  location: "Celebr8 Centre, Olu Obasanjo Road, Port Harcourt"
};

type RegistrationRow = {
  id: string;
  event_slug: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  occupation: string;
  coming_from: string;
  who_told_you: string | null;
  created_at: string;
};

type RegistrationBody = {
  firstName?: string;
  first_name?: string;
  lastName?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  occupation?: string;
  comingFrom?: string;
  coming_from?: string;
  whoToldYou?: string;
  who_told_you?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const defaultComingFrom = "Port Harcourt";

const isUniqueViolation = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return normalized.includes("duplicate") || normalized.includes("unique");
};

const readString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const readField = (body: RegistrationBody, ...keys: Array<keyof RegistrationBody>): string => {
  for (const key of keys) {
    const value = readString(body[key]);
    if (value) {
      return value;
    }
  }

  return "";
};

const toRegistration = (row: RegistrationRow) => ({
  id: row.id,
  eventSlug: row.event_slug,
  firstName: row.first_name,
  lastName: row.last_name,
  email: row.email,
  phone: row.phone,
  occupation: row.occupation,
  comingFrom: row.coming_from,
  whoToldYou: row.who_told_you,
  createdAt: row.created_at
});

registrationRouter.get("/event", async (_req: Request, res: Response): Promise<void> => {
  try {
    const admin = getAdminClient();
    const { count, error } = await admin
      .from("event_registrations")
      .select("id", { count: "exact", head: true })
      .eq("event_slug", eventSlug);

    if (error) {
      res.status(400).json({ message: error.message });
      return;
    }

    res.status(200).json({
      data: {
        ...eventInfo,
        registeredCount: count ?? 0
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch event details";
    res.status(500).json({ message });
  }
});

registrationRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as RegistrationBody;
  const firstName = readField(body, "firstName", "first_name");
  const lastName = readField(body, "lastName", "last_name");
  const email = readField(body, "email").toLowerCase();
  const phone = readField(body, "phone");
  const occupation = readField(body, "occupation");
  const comingFrom = readField(body, "comingFrom", "coming_from") || defaultComingFrom;
  const whoToldYou = readField(body, "whoToldYou", "who_told_you");

  if (!firstName || !lastName || !email || !phone || !occupation) {
    res.status(400).json({
      message: "firstName, lastName, email, phone, and occupation are required"
    });
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

  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("event_registrations")
      .insert({
        event_slug: eventSlug,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        occupation,
        coming_from: comingFrom,
        who_told_you: whoToldYou || null
      })
      .select(
        "id, event_slug, first_name, last_name, email, phone, occupation, coming_from, who_told_you, created_at"
      )
      .single();

    if (error) {
      if (isUniqueViolation(error.message)) {
        res.status(409).json({ message: "This email is already on the seat list" });
        return;
      }

      res.status(400).json({ message: error.message });
      return;
    }

    res.status(201).json({
      message: "You're on the seat list",
      data: toRegistration(data as RegistrationRow)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit registration";
    res.status(500).json({ message });
  }
});

registrationRouter.get("/", auth, async (req: Request, res: Response): Promise<void> => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  const search = (req.query.search as string | undefined)?.trim();
  const safePage = Math.max(page, 1);
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;

  try {
    const admin = getAdminClient();
    let query = admin
      .from("event_registrations")
      .select(
        "id, event_slug, first_name, last_name, email, phone, occupation, coming_from, who_told_you, created_at",
        { count: "exact" }
      )
      .eq("event_slug", eventSlug)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (search) {
      const safeSearch = search.replace(/[%*,()]/g, "").trim();
      if (safeSearch) {
        query = query.or(
          `first_name.ilike.%${safeSearch}%,last_name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%,coming_from.ilike.%${safeSearch}%`
        );
      }
    }

    const { data, error, count } = await query;

    if (error) {
      res.status(400).json({ message: error.message });
      return;
    }

    res.status(200).json({
      data: ((data ?? []) as RegistrationRow[]).map(toRegistration),
      meta: {
        page: safePage,
        limit: safeLimit,
        total: count ?? 0
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch registrations";
    res.status(500).json({ message });
  }
});

export { registrationRouter };
