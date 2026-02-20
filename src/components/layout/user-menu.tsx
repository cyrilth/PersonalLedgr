"use client"

/**
 * User profile dropdown menu in the sidebar footer.
 *
 * Shows the user's avatar (image or initials) and name as a trigger.
 * Dropdown contains: user info, Profile link, and Log out button.
 * Opens upward (side="top") since it's positioned at the bottom of the sidebar.
 */

import Link from "next/link"
import { useRouter } from "next/navigation"
import { LogOut, UserIcon } from "lucide-react"
import { useSession, signOut } from "@/lib/auth-client"
import { AvatarInitials } from "@/components/ui/avatar-initials"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function UserMenu() {
  const { data: session } = useSession()
  const router = useRouter()

  const user = session?.user

  async function handleSignOut() {
    await signOut()
    router.push("/login")
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-sidebar-accent transition-colors">
        <AvatarInitials name={user?.name} image={user?.image} size="sm" />
        <span className="truncate max-w-[120px] font-medium">
          {user?.name || "User"}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{user?.name || "User"}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile" className="cursor-pointer">
            <UserIcon className="mr-2 h-4 w-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
