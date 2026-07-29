import { db } from "./client"
import { users, templates, settings } from "./schema"
import bcrypt from "bcryptjs"

async function seed() {
  const adminExists = db.select().from(users).where(users.email.equals("admin@atis.local")).get()
  if (!adminExists) {
    await db.insert(users).values({
      email: "admin@atis.local",
      name: "System Administrator",
      passwordHash: await bcrypt.hash("admin123", 10),
      role: "admin",
    })
    console.log("Admin user created")
  }

  const templateCount = db.select().from(templates).all()
  if (templateCount.length === 0) {
    const defaultTemplates = [
      { name: "Executive Brief", type: "executive", config: JSON.stringify({ logo: "/logo.png", primaryColor: "#2563eb", font: "Inter", watermark: false }) },
      { name: "Investor Brief", type: "investor", config: JSON.stringify({ logo: "/logo.png", primaryColor: "#059669", font: "Inter", watermark: false }) },
      { name: "Government Memorandum", type: "government", config: JSON.stringify({ logo: "/logo.png", primaryColor: "#7c3aed", font: "Georgia", watermark: true }) },
      { name: "Strategic Intelligence Report", type: "strategic", config: JSON.stringify({ logo: "/logo.png", primaryColor: "#dc2626", font: "Inter", watermark: true }) },
      { name: "Board Report", type: "board", config: JSON.stringify({ logo: "/logo.png", primaryColor: "#0891b2", font: "Inter", watermark: false }) },
      { name: "Research Report", type: "research", config: JSON.stringify({ logo: "/logo.png", primaryColor: "#4f46e5", font: "Inter", watermark: false }) },
      { name: "Donor Brief", type: "donor", config: JSON.stringify({ logo: "/logo.png", primaryColor: "#db2777", font: "Inter", watermark: false }) },
    ]
    await db.insert(templates).values(defaultTemplates.map(t => ({ ...t, createdBy: 1 })))
    console.log("Default templates created")
  }

  const inviteSetting = db.select().from(settings).where(settings.key.equals("invite_code")).get()
  if (!inviteSetting) {
    await db.insert(settings).values({
      key: "invite_code",
      value: process.env.REGISTRATION_INVITE_CODE || "ATIS2024SECURE99",
    })
    console.log("Invite code setting created")
  }
}

seed().catch(console.error)
