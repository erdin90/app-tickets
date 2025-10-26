'use client';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import AppHeader from "@/components/AppHeader";
import { redirect } from "next/navigation";

export default function Page(){ redirect("/dashboard"); }
