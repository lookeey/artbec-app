'use client';
import {useEffect,useState} from 'react';
import {ThemeProvider,useTheme} from 'next-themes';
import {Moon,Sun} from 'lucide-react';
export function ArtbecTheme({children}:{children:React.ReactNode}){return <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="artbec-theme" disableTransitionOnChange>{children}</ThemeProvider>}
export function ThemeToggle(){const {theme,setTheme}=useTheme(),[mounted,setMounted]=useState(false);useEffect(()=>setMounted(true),[]);const dark=mounted&&theme==='dark';return <button type="button" className="theme-toggle" aria-label={dark?'Ativar modo claro':'Ativar modo noturno'} title={dark?'Modo claro':'Modo noturno'} aria-pressed={dark} disabled={!mounted} onClick={()=>setTheme(dark?'light':'dark')}>{dark?<Sun size={18}/>:<Moon size={18}/>}<span>{dark?'Modo claro':'Modo noturno'}</span></button>}
