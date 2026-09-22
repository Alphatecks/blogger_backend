import type { Request, Response } from "express";
import { Router } from "express";

import { getAdminClient } from "../lib/db";
import { auth } from "../middleware/auth";

const volunteerRouter = Router();

const eventSlug = (process.env.KAIROS_EVENT_SLUG || "remnants-reborn-2026").trim();

const volunteerTitles = ["Mr", "Mrs", "Miss", "Ms", "Dr", "Pastor", "Bro", "Sis"] as const;

const volunteerAreas = [
  { slug: "ushering-protocol", name: "Ushering/Protocol" },
  { slug: "content-creation", name: "Content Creation" },
  { slug: "social-media", name: "Social Media" },
  { slug: "logistics", name: "Logistics" },
  { slug: "publicity", name: "Publicity" },
  { slug: "graphics-design", name: "Graphics Design" },
  { slug: "admin", name: "Admin" },
  { slug: "medicals", name: "Medicals" }
] as const;

const availabilityOptions = [
  { slug: "full-day", name: "Full Day" },
  { slug: "morning-only", name: "Morning Only" },
  { slug: "afternoon-only", name: "Afternoon Only" }
] as const;

type VolunteerAreaSlug = (typeof volunteerAreas)[number]["slug"];
type AvailabilitySlug = (typeof availabilityOptions)[number]["slug"];

type VolunteerRow = {
  id: string;
  event_slug: string;
  title: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  church_organization: string | null;
  relevant_skills: string | null;
  volunteer_areas: string[];
  availability: AvailabilitySlug;
  volunteered_before: boolean;
  experience_note: string | null;
  created_at: string;
};

type VolunteerBody = {
  title?: string;
  firstName?: string;
  first_name?: string;
  lastName?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  churchOrganization?: string;
  church_organization?: string;
  church?: string;
  relevantSkills?: string;
  relevant_skills?: string;
  volunteerAreas?: unknown;
  volunteer_areas?: unknown;
  preferredVolunteerAreas?: unknown;
  availability?: string;
  volunteeredBefore?: unknown;
  volunteered_before?: unknown;
  experienceNote?: string;
  experience_note?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const areaSlugSet = new Set<string>(volunteerAreas.map((area) => area.slug));
const availabilitySlugSet = new Set<string>(availabilityOptions.map((item) => item.slug));
const titleSet = new Set(volunteerTitles.map((item) => item.toLowerCase()));

const volunteerSelect =
  "id, event_slug, title, first_name, last_name, email, phone, church_organization, relevant_skills, volunteer_areas, availability, volunteered_before, experience_note, created_at";

const isUniqueViolation = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return normalized.includes("duplicate") || normalized.includes("unique");
};

const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const readField = (body: VolunteerBody, ...keys: Array<keyof VolunteerBody>): string => {
  for (const key of keys) {
    const value = readString(body[key]);
    if (value) {
      return value;
    }
  }

  return "";
};

const normalizeTitle = (value: string): string => value.replace(/\./g, "").trim();

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const readAreas = (value: unknown): VolunteerAreaSlug[] => {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  const unique = new Set<VolunteerAreaSlug>();

  for (const item of rawValues) {
    const slug = slugify(readString(item));
    if (areaSlugSet.has(slug)) {
      unique.add(slug as VolunteerAreaSlug);
    }
  }

  return [...unique];
};

const readAvailability = (value: string): AvailabilitySlug | "" => {
  const slug = slugify(value);
  return availabilitySlugSet.has(slug) ? (slug as AvailabilitySlug) : "";
};

const readBoolean = (value: unknown): boolean | null => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }

  const normalized = readString(value).toLowerCase();
  if (["yes", "true", "1"].includes(normalized)) {
    return true;
  }
  if (["no", "false", "0"].includes(normalized)) {
    return false;
  }

  return null;
};

const toVolunteer = (row: VolunteerRow) => ({
  id: row.id,
  eventSlug: row.event_slug,
  title: row.title,
  firstName: row.first_name,
  lastName: row.last_name,
  fullName: [row.title, row.first_name, row.last_name].filter(Boolean).join(" "),
  email: row.email,
  phone: row.phone,
  churchOrganization: row.church_organization,
  relevantSkills: row.relevant_skills,
  volunteerAreas: row.volunteer_areas,
  availability: row.availability,
  volunteeredBefore: row.volunteered_before,
  experienceNote: row.experience_note,
  createdAt: row.created_at
});

volunteerRouter.get("/options", (_req: Request, res: Response): void => {
  res.status(200).json({
    data: {
      titles: [...volunteerTitles],
      volunteerAreas,
      availability: availabilityOptions
    }
  });
});

volunteerRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as VolunteerBody;
  const rawTitle = normalizeTitle(readField(body, "title"));
  const title = rawTitle
    ? volunteerTitles.find((item) => item.toLowerCase() === rawTitle.toLowerCase()) || ""
    : "";
  const firstName = readField(body, "firstName", "first_name");
  const lastName = readField(body, "lastName", "last_name");
  const email = readField(body, "email").toLowerCase();
  const phone = readField(body, "phone");
  const churchOrganization = readField(body, "churchOrganization", "church_organization", "church");
  const relevantSkills = readField(body, "relevantSkills", "relevant_skills");
  const areas = readAreas(body.volunteerAreas ?? body.volunteer_areas ?? body.preferredVolunteerAreas);
  const availability = readAvailability(readField(body, "availability"));
  const volunteeredBefore = readBoolean(body.volunteeredBefore ?? body.volunteered_before);
  const experienceNote = readField(body, "experienceNote", "experience_note");

  if (rawTitle && !titleSet.has(rawTitle.toLowerCase())) {
    res.status(400).json({ message: "Select a valid title" });
    return;
  }

  if (!firstName || !lastName || !email || !phone) {
    res.status(400).json({ message: "firstName, lastName, email, and phone are required" });
    return;
  }

  if (!emailPattern.test(email)) {
    res.status(400).json({ message: "Enter a valid email address" });
    return;
  }

  if (phone.replace(/\D/g, "").length < 7) {
    res.status(400).json({ message: "Enter a valid WhatsApp number" });
    return;
  }

  if (areas.length === 0) {
    res.status(400).json({ message: "Select at least one volunteer area" });
    return;
  }

  if (!availability) {
    res.status(400).json({ message: "Select availability to volunteer" });
    return;
  }

  if (volunteeredBefore === null) {
    res.status(400).json({ message: "Say whether you have volunteered with Kairos Summit before" });
    return;
  }

  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("volunteer_applications")
      .insert({
        event_slug: eventSlug,
        title: title || null,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        church_organization: churchOrganization || null,
        relevant_skills: relevantSkills || null,
        volunteer_areas: areas,
        availability,
        volunteered_before: volunteeredBefore,
        experience_note: experienceNote || null
      })
      .select(volunteerSelect)
      .single();

    if (error) {
      if (isUniqueViolation(error.message)) {
        res.status(409).json({ message: "This email already has a volunteer application" });
        return;
      }

      res.status(400).json({ message: error.message });
      return;
    }

    res.status(201).json({
      message: "Volunteer application submitted",
      data: toVolunteer(data as VolunteerRow)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit volunteer application";
    res.status(500).json({ message });
  }
});

volunteerRouter.get("/", auth, async (req: Request, res: Response): Promise<void> => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  const search = (req.query.search as string | undefined)?.trim();
  const availability = slugify((req.query.availability as string | undefined) || "");
  const area = slugify((req.query.area as string | undefined) || "");
  const safePage = Math.max(page, 1);
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;

  try {
    const admin = getAdminClient();
    let query = admin
      .from("volunteer_applications")
      .select(volunteerSelect, { count: "exact" })
      .eq("event_slug", eventSlug)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (availability && availabilitySlugSet.has(availability)) {
      query = query.eq("availability", availability);
    }

    if (area && areaSlugSet.has(area)) {
      query = query.contains("volunteer_areas", [area]);
    }

    if (search) {
      const safeSearch = search.replace(/[%*,()]/g, "").trim();
      if (safeSearch) {
        query = query.or(
          `first_name.ilike.%${safeSearch}%,last_name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%,church_organization.ilike.%${safeSearch}%`
        );
      }
    }

    const { data, error, count } = await query;

    if (error) {
      res.status(400).json({ message: error.message });
      return;
    }

    res.status(200).json({
      data: ((data ?? []) as VolunteerRow[]).map(toVolunteer),
      meta: {
        page: safePage,
        limit: safeLimit,
        total: count ?? 0
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch volunteer applications";
    res.status(500).json({ message });
  }
});

export { volunteerRouter };
