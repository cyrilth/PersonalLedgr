import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { seed } from "./seed.js"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

seed(prisma)
  .catch((e) => {
    console.error("[seed] Error:", e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
