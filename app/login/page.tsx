'use client';

import React, { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import LoginScreen from '@/components/LoginScreen';
import { Sun } from 'lucide-react';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialError = searchParams ? searchParams.get('error') : null;

  return (
    <LoginScreen 
      onLoginSuccess={() => {
        router.replace('/');
      }}
      initialError={initialError}
    />
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-[#121212] text-[#D4AF37]">
        <Sun className="w-8 h-8 animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
