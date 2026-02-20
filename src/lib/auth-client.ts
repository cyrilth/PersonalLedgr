"use client"

/**
 * Better Auth client-side SDK.
 *
 * Provides React hooks and functions for auth operations in client components:
 * - signIn/signUp/signOut — auth flows (used in login/register pages)
 * - useSession — React hook returning { data: { user, session } } for current user
 * - updateUser — update name/image via Better Auth API (used in profile page)
 * - changePassword — change password with current password verification
 */

import { createAuthClient } from "better-auth/react"

export const { signIn, signUp, signOut, useSession, updateUser, changePassword } = createAuthClient()
