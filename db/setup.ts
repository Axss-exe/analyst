import { execSync } from "child_process"
import { db } from "./client"
import { users, templates, settings } from "./schema"
import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"

async function setup() {
  console.log("Step 1: Pushing schema to database...")
  try {
    execSync("npx drizzle-kit push", { stdio: "inherit" })
  } catch (e) {
    console.error("Push failed. If tables already exist, this is fine.")
  }

  console.log("\nStep 2: Seeding default data...")

  // Create admin user if not exists
  const adminExists = db.select().from(users).where(eq(users.email, "admin@atis.local")).get()
  if (!adminExists) {
    db.insert(users).values({
      email: "admin@atis.local",
      name: "System Administrator",
      passwordHash: await bcrypt.hash("admin123", 10),
      role: "admin",
    }).run()
    console.log("  Admin user created: admin@atis.local / admin123")
  } else {
    console.log("  Admin user already exists")
  }

  // Create default templates if none exist
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
    db.insert(templates).values(defaultTemplates.map(t => ({ ...t, createdBy: 1 }))).run()
    console.log("  Default templates created")
  } else {
    console.log("  Templates already exist")
  }

  // Create invite code setting if not exists
  const inviteSetting = db.select().from(settings).where(eq(settings.key, "invite_code")).get()
  if (!inviteSetting) {
    db.insert(settings).values({
      key: "invite_code",
      value: process.env.REGISTRATION_INVITE_CODE || "ATIS2024SECURE99",
    }).run()
    console.log("  Invite code setting created")
  } else {
    console.log("  Invite code setting already exists")
  }

  console.log("\nSetup complete!")
  console.log("  Login: admin@atis.local")
  console.log("  Password: admin123")
  console.log("  Change password immediately after first login.")
}

setup().catch((err) => {
  console.error("Setup failed:", err)
  process.exit(1)
})
