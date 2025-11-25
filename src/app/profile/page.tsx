'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/app-layout'
import {
  UserCircleIcon,
  KeyIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  SparklesIcon
} from '@heroicons/react/24/outline'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { showToast } from '@/components/toast'

function ProfileContent() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [editingPassword, setEditingPassword] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    licenseKey: ''
  })

  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        name: (user as { name?: string; email?: string }).name || '',
        email: (user as { name?: string; email?: string }).email || ''
      }))
    }
  }, [user])

  const handleProfileUpdate = async () => {
    try {
      setLoading(true)

      const response = await fetch('/api/user/update-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('sessionToken')}`
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update profile')
      }

      showToast({
        type: 'success',
        title: 'Profile updated',
        message: 'Your profile information has been updated successfully'
      })
      setEditingProfile(false)
      // Force reload to update context/session if needed, or we could update the context
      window.location.reload()
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Update failed',
        message: error instanceof Error ? error.message : 'Failed to update profile'
      })
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordChange = async () => {
    if (formData.newPassword !== formData.confirmPassword) {
      showToast({
        type: 'error',
        title: 'Password mismatch',
        message: 'New password and confirmation password do not match'
      })
      return
    }

    if (formData.newPassword.length < 8) {
      showToast({
        type: 'error',
        title: 'Password too short',
        message: 'Password must be at least 8 characters long'
      })
      return
    }

    try {
      setLoading(true)

      const response = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('sessionToken')}`
        },
        body: JSON.stringify({
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to change password')
      }

      showToast({
        type: 'success',
        title: 'Password updated',
        message: 'Your password has been updated successfully'
      })
      setEditingPassword(false)
      setFormData(prev => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }))
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Password change failed',
        message: error instanceof Error ? error.message : 'Failed to change password'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleLicenseSave = async () => {
    if (!formData.licenseKey.trim()) {
      showToast({
        type: 'error',
        title: 'Validation Error',
        message: 'Please enter a license key'
      })
      return
    }

    try {
      setLoading(true)
      const response = await fetch('/api/license/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('sessionToken')}`
        },
        body: JSON.stringify({
          licenseKey: formData.licenseKey
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to activate license')
      }

      showToast({
        type: 'success',
        title: 'License Activated',
        message: 'Your license has been activated successfully'
      })
      
      // Reload to reflect new status
      setTimeout(() => window.location.reload(), 1500)
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Update failed',
        message: error instanceof Error ? error.message : 'Failed to update license key'
      })
    } finally {
      setLoading(false)
    }
  }

  const userEmail = (user as { email?: string })?.email || ''
  const userName = (user as { name?: string })?.name || 'User'

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Profile</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
          Manage your account information and preferences
        </p>
      </div>

      <div className="space-y-8">
        {/* Profile Information */}
        <div className="bg-white dark:bg-slate-800 shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-medium text-gray-900 flex items-center">
                <UserCircleIcon className="h-5 w-5 mr-2" />
                Profile Information
              </h3>
              {!editingProfile && (
                <Button
                  outline
                  onClick={() => setEditingProfile(true)}
                >
                  <PencilIcon className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
            </div>

            {editingProfile ? (
              <div className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                    Name
                  </label>
                  <Input
                    type="text"
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="mt-1"
                    placeholder="Your full name"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                    Email
                  </label>
                  <Input
                    type="email"
                    id="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="mt-1"
                    placeholder="your.email@example.com"
                  />
                </div>

                <div className="flex space-x-3">
                  <Button
                    onClick={handleProfileUpdate}
                    disabled={loading}
                  >
                    <CheckIcon className="h-4 w-4 mr-1" />
                    {loading ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button
                    outline
                    onClick={() => {
                      setEditingProfile(false)
                      setFormData(prev => ({
                        ...prev,
                        name: (user as { name?: string; email?: string }).name || '',
                        email: (user as { name?: string; email?: string }).email || ''
                      }))
                    }}
                  >
                    <XMarkIcon className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Name</label>
                  <p className="mt-1 text-sm text-gray-900 dark:text-white">{userName}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Email</label>
                  <p className="mt-1 text-sm text-gray-900 dark:text-white">{userEmail}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Password Change */}
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-medium text-gray-900 flex items-center">
                <KeyIcon className="h-5 w-5 mr-2" />
                Password
              </h3>
              {!editingPassword && (
                <Button
                  outline
                  onClick={() => setEditingPassword(true)}
                >
                  <PencilIcon className="h-4 w-4 mr-1" />
                  Change Password
                </Button>
              )}
            </div>

            {editingPassword ? (
              <div className="space-y-4">
                <div>
                  <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                    Current Password
                  </label>
                  <Input
                    type="password"
                    id="currentPassword"
                    value={formData.currentPassword}
                    onChange={(e) => setFormData(prev => ({ ...prev, currentPassword: e.target.value }))}
                    className="mt-1"
                    placeholder="Enter current password"
                  />
                </div>

                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                    New Password
                  </label>
                  <Input
                    type="password"
                    id="newPassword"
                    value={formData.newPassword}
                    onChange={(e) => setFormData(prev => ({ ...prev, newPassword: e.target.value }))}
                    className="mt-1"
                    placeholder="Enter new password (min 8 characters)"
                  />
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                    Confirm New Password
                  </label>
                  <Input
                    type="password"
                    id="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    className="mt-1"
                    placeholder="Confirm new password"
                  />
                </div>

                <div className="flex space-x-3">
                  <Button
                    onClick={handlePasswordChange}
                    disabled={loading || !formData.currentPassword || !formData.newPassword || !formData.confirmPassword}
                  >
                    <CheckIcon className="h-4 w-4 mr-1" />
                    {loading ? 'Updating...' : 'Update Password'}
                  </Button>
                  <Button
                    outline
                    onClick={() => {
                      setEditingPassword(false)
                      setFormData(prev => ({
                        ...prev,
                        currentPassword: '',
                        newPassword: '',
                        confirmPassword: ''
                      }))
                    }}
                  >
                    <XMarkIcon className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600 dark:text-slate-400">
                Change your account password to keep your account secure.
              </p>
            )}
          </div>
        </div>
        {/* License Settings */}
        <div className="bg-white dark:bg-slate-800 shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-medium text-gray-900 flex items-center">
                <SparklesIcon className="h-5 w-5 mr-2" />
                Licensing
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="licenseKey" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                  License Key
                </label>
                <Input
                  type="text"
                  id="licenseKey"
                  value={formData.licenseKey}
                  onChange={(e) => setFormData(prev => ({ ...prev, licenseKey: e.target.value }))}
                  className="mt-1"
                  placeholder="Enter your license key"
                />
              </div>

              <div className="flex space-x-3">
                <Button
                  onClick={handleLicenseSave}
                  disabled={loading}
                >
                  <CheckIcon className="h-4 w-4 mr-1" />
                  {loading ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  outline
                  onClick={() => window.open('https://elova.dev/pricing', '_blank')}
                >
                  Upgrade
                </Button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

export default function ProfilePage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/signin')
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-rose-600"></div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <AppLayout>
      <ProfileContent />
    </AppLayout>
  )
}