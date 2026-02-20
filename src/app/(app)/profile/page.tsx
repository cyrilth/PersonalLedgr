"use client"

/**
 * User profile management page.
 *
 * Three sections:
 * 1. Avatar + display name — click avatar to upload image (PNG/JPG/WEBP, max 2MB),
 *    client-side cropped to 256px square webp, stored as base64 in user.image
 * 2. Email — read-only display
 * 3. Change password — validates current password server-side via Better Auth
 *
 * All updates use Better Auth's client SDK (updateUser, changePassword) directly
 * rather than custom server actions.
 */

import { useState, useRef } from "react"
import { toast } from "sonner"
import { useSession, updateUser, changePassword } from "@/lib/auth-client"
import { AvatarInitials } from "@/components/ui/avatar-initials"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Camera, Trash2 } from "lucide-react"

/**
 * Client-side image resize: crops to center square, scales to maxSize px,
 * and converts to webp at 85% quality. Returns a base64 data URL.
 */
function resizeImage(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const reader = new FileReader()
    reader.onload = () => {
      img.onload = () => {
        const canvas = document.createElement("canvas")
        const size = Math.min(img.width, img.height)
        const sx = (img.width - size) / 2
        const sy = (img.height - size) / 2
        canvas.width = maxSize
        canvas.height = maxSize
        const ctx = canvas.getContext("2d")!
        ctx.drawImage(img, sx, sy, size, size, 0, 0, maxSize, maxSize)
        resolve(canvas.toDataURL("image/webp", 0.85))
      }
      img.onerror = reject
      img.src = reader.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function ProfilePage() {
  const { data: session } = useSession()
  const user = session?.user

  const [name, setName] = useState("")
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [savingPassword, setSavingPassword] = useState(false)

  // Initialize name from session when it loads
  const displayName = name || user?.name || ""
  const displayImage = avatarPreview !== null ? avatarPreview : (user?.image || null)

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2MB")
      return
    }

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("Only PNG, JPEG, and WebP images are supported")
      return
    }

    try {
      const dataUrl = await resizeImage(file, 256)
      setAvatarPreview(dataUrl)
    } catch {
      toast.error("Failed to process image")
    }
  }

  function handleRemoveAvatar() {
    setAvatarPreview("")
  }

  async function handleSaveProfile() {
    setSavingProfile(true)
    try {
      const updates: { name?: string; image?: string | null } = {}
      if (displayName !== (user?.name || "")) updates.name = displayName
      if (avatarPreview !== null) {
        updates.image = avatarPreview || null
      }

      if (Object.keys(updates).length === 0) {
        toast.info("No changes to save")
        setSavingProfile(false)
        return
      }

      const { error } = await updateUser(updates)
      if (error) throw error
      setAvatarPreview(null)
      toast.success("Profile updated")
    } catch {
      toast.error("Failed to update profile")
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters")
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match")
      return
    }

    setSavingPassword(true)
    try {
      const { error } = await changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: false,
      })
      if (error) throw error
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      toast.success("Password changed successfully")
    } catch {
      toast.error("Failed to change password. Check your current password.")
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="space-y-6 p-6 md:p-8 max-w-2xl">
      {/* Avatar & Name */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Manage your name and avatar</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative group">
              <AvatarInitials name={displayName} image={displayImage} size="lg" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Camera className="h-5 w-5 text-white" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-sm text-muted-foreground">
                Click avatar to upload a new image
              </p>
              {(displayImage) && (
                <Button variant="ghost" size="sm" onClick={handleRemoveAvatar}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Remove avatar
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Display name</Label>
            <Input
              id="name"
              value={displayName}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>

          <Button onClick={handleSaveProfile} disabled={savingProfile}>
            {savingProfile ? "Saving..." : "Save changes"}
          </Button>
        </CardContent>
      </Card>

      {/* Email (read-only) */}
      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>Your email address cannot be changed here</CardDescription>
        </CardHeader>
        <CardContent>
          <Input value={user?.email || ""} disabled />
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your account password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <Button type="submit" disabled={savingPassword}>
              {savingPassword ? "Changing..." : "Change password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
