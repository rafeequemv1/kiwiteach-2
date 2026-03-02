import '../../types';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../supabase/client';
import { GoogleGenAI, Type } from "@google/genai";
import { ensureApiKey } from '../../services/geminiService';
import { parsePseudoLatexAndMath } from '../../utils/latexParser';

interface SyllabusEntry {
    id?: string;
    class_name: string;
    subject_name: string;
    chapter_name: string;
    topic_list: string;
    unit_number?: number;
    chapter_number?: number;
    unit_name?: string;
}

const SyllabusManager: React.FC = () => {
    const [entries, setEntries] = useState<SyllabusEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isParsing, setIsParsing] = useState(false);
    const [rawInput, setRawInput] = useState('');
    const [search, setSearch] = useState('');
    
    const [parsedPreview, setParsedPreview] = useState<SyllabusEntry[] | null>(null);
    const [selectedClass, setSelectedClass] = useState('all');
    const [selectedSubject, setSelectedSubject] = useState('all');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    const [editingEntry, setEditingEntry] = useState<SyllabusEntry | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isCheckingDb, setIsCheckingDb] = useState(false);
    const [topicQuestionCounts, setTopicQuestionCounts] = useState<Record<string, number | 'loading'>>({});
    const [topicEditMode, setTopicEditMode] = useState<'list' | 'paragraph'>('list');
    const [newTopicInput, setNewTopicInput] = useState('');

    // Chat Assistant State
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatQuery, setChatQuery] = useState('');
    const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant', text: string }[]>([]);
    const [isChatThinking, setIsChatThinking] = useState(false);
    const chatScrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchSyllabus();
    }, []);

    useEffect(() => {
        if (chatScrollRef.current) {
            chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
        }
    }, [chatHistory, isChatThinking]);

    const fetchSyllabus = async () => {
        setIsLoading(true);
        const { data } = await supabase.from('NEET_syllabus').select('*');
        setEntries(data || []);
        setIsLoading(false);
    };

    /**
     * Enhanced Chat Submission: Two-stage retrieval
     * 1. Search for relevant chapters by keyword or simple AI routing.
     * 2. Fetch Deep Context (raw_text) for those chapters.
     * 3. Construct a high-precision response.
     */
    const handleChatSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatQuery.trim() || isChatThinking) return;

        const userMsg = chatQuery.trim();
        setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
        setChatQuery('');
        setIsChatThinking(true);

        try {
            await ensureApiKey();
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            // Step 1: Identify relevant chapters via keyword or title matching
            // We search for chapters that might contain the answer
            const { data: matchedChapters } = await supabase
                .from('chapters')
                .select('id, name, raw_text, subject_name')
                .or(`name.ilike.%${userMsg.substring(0, 10)}%,raw_text.ilike.%${userMsg.substring(0, 10)}%`)
                .limit(2); // Limit to 2 chapters to keep tokens/cost very low

            const deepContext = matchedChapters?.map(c => 
                `CHAPTER: ${c.name} (${c.subject_name})\nCONTENT SNIPPET: ${c.raw_text?.substring(0, 4000) || 'No text content available.'}`
            ).join('\n\n') || "No deep chapter text found.";

            const syllabusContext = entries.slice(0, 100).map(e => 
                `${e.class_name} ${e.subject_name} | ${e.chapter_name}: ${e.topic_list}`
            ).join('\n');
            
            const systemInstruction = `
                You are the 'Syllabus Guardian', an elite AI assistant for the NEET Exam platform.
                Your goal is to provide accurate, elegant, and highly structured information about the exam syllabus.
                
                SOURCE SYLLABUS LIST:
                ${syllabusContext}
                
                DEEP CHAPTER KNOWLEDGE (SEARCH RESULTS):
                ${deepContext}
                
                RESPONSE RULES:
                1. FORMATTING: Use bold (**text**) for emphasis. Use Bullet points for lists. Use KaTeX ($math$) for scientific notation.
                2. ACCURACY: If a topic is not in the syllabus list OR the deep chapter knowledge, state it is "OUT OF SYLLABUS" with confidence.
                3. STYLE: Be helpful but professional. Do not use conversational filler.
                4. IDENTIFICATION: If you find info in a specific chapter, mention the chapter name clearly.
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: [{ role: 'user', parts: [{ text: `User Question: ${userMsg}` }] }],
                config: {
                    systemInstruction: systemInstruction,
                    temperature: 0.1,
                }
            });

            const reply = response.text || "I apologize, but I encountered a processing error in the Neural Link.";
            setChatHistory(prev => [...prev, { role: 'assistant', text: reply }]);
        } catch (err: any) {
            setChatHistory(prev => [...prev, { role: 'assistant', text: "Critical failure in deep search protocol: " + err.message }]);
        } finally {
            setIsChatThinking(false);
        }
    };

    const handleAIParsing = async () => {
        if (!rawInput.trim()) return;
        setIsParsing(true);
        try {
            await ensureApiKey();
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const prompt = `Parse this raw NEET syllabus text into structured JSON: ${rawInput}`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                class_name: { type: Type.STRING },
                                subject_name: { type: Type.STRING },
                                unit_name: { type: Type.STRING },
                                unit_number: { type: Type.NUMBER },
                                chapter_name: { type: Type.STRING },
                                chapter_number: { type: Type.NUMBER },
                                topic_list: { type: Type.STRING }
                            }
                        }
                    }
                }
            });

            const parsed = JSON.parse(response.text || "[]");
            setParsedPreview(parsed);
        } catch (e: any) {
            alert("Parsing failed: " + e.message);
        } finally {
            setIsParsing(false);
        }
    };

    const handleConfirmAIParsing = async () => {
        if (!parsedPreview) return;
        setIsSaving(true);
        try {
            const { error } = await supabase.from('NEET_syllabus').insert(parsedPreview);
            if (error) throw error;
            alert(`Ingested ${parsedPreview.length} nodes.`);
            setRawInput('');
            setParsedPreview(null);
            fetchSyllabus();
        } catch (e: any) {
            alert("Save failed: " + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveSyllabus = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingEntry) return;
        setIsSaving(true);
        try {
            if (editingEntry.id) {
                const { error } = await supabase
                    .from('NEET_syllabus')
                    .update({ 
                        class_name: editingEntry.class_name,
                        subject_name: editingEntry.subject_name,
                        unit_name: editingEntry.unit_name,
                        unit_number: editingEntry.unit_number,
                        chapter_name: editingEntry.chapter_name,
                        chapter_number: editingEntry.chapter_number,
                        topic_list: editingEntry.topic_list
                     })
                    .eq('id', editingEntry.id);
                if (error) throw error;
            } else {
                const { id, ...payload } = editingEntry;
                await supabase.from('NEET_syllabus').insert(payload);
            }
            fetchSyllabus();
            handleCloseModal();
        } catch (err: any) {
            alert("Save failed: " + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const deleteEntry = async (id: string) => {
        if (!confirm("Remove this syllabus node?")) return;
        await supabase.from('NEET_syllabus').delete().eq('id', id);
        fetchSyllabus();
    };
    
    const handleCloseModal = () => {
        setEditingEntry(null);
        setTopicQuestionCounts({});
        setIsCheckingDb(false);
        setNewTopicInput('');
        setTopicEditMode('list');
    };

    const { uniqueClasses, uniqueSubjects } = useMemo(() => {
        const classSet = new Set<string>();
        const subjectSet = new Set<string>();
        entries.forEach(e => {
            classSet.add(e.class_name);
            subjectSet.add(e.subject_name);
        });
        return { uniqueClasses: Array.from(classSet).sort(), uniqueSubjects: Array.from(subjectSet).sort() };
    }, [entries]);

    const filteredAndSorted = useMemo(() => {
        return entries
            .filter(e => {
                const s = search.toLowerCase();
                return e.chapter_name.toLowerCase().includes(s) || e.topic_list.toLowerCase().includes(s) &&
                       (selectedClass === 'all' || e.class_name === selectedClass) &&
                       (selectedSubject === 'all' || e.subject_name === selectedSubject);
            })
            .sort((a, b) => a.class_name.localeCompare(b.class_name) || (a.chapter_number || 0) - (b.chapter_number || 0));
    }, [entries, search, selectedClass, selectedSubject]);

    // Format Markdown/AI response into elegant styled blocks
    const renderAssistantReply = (text: string) => {
        // Simple MD helper for assistant text
        let html = parsePseudoLatexAndMath(text);
        // Better bold handling for MD stars
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="text-indigo-700 font-black">$1</strong>');
        // List handling
        html = html.replace(/^\s*[-*]\s+(.*)$/gm, '<li class="ml-4 list-disc">$1</li>');
        return <div className="space-y-2 prose prose-sm prose-indigo" dangerouslySetInnerHTML={{ __html: html }} />;
    };

    return (
        <div className="animate-fade-in p-6 space-y-6 relative h-full flex flex-col overflow-hidden bg-slate-50/50">
            <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm flex flex-col gap-6 shrink-0">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Authorized NEET Topics</h2>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Master Filter Index for AI Forge</p>
                    </div>
                    <div className="flex items-center gap-3">
                         <button onClick={() => setEditingEntry({ class_name: '', subject_name: '', chapter_name: '', topic_list: '' })} className="bg-accent text-white px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-xl shadow-accent/20 hover:bg-indigo-700 active:scale-95 transition-all">
                             <iconify-icon icon="mdi:plus" /> New Chapter
                         </button>
                         <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                            <button onClick={() => setViewMode('grid')} className={`p-2 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-accent' : 'text-slate-400'}`}><iconify-icon icon="mdi:view-grid" width="18" /></button>
                            <button onClick={() => setViewMode('list')} className={`p-2 rounded-xl transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-accent' : 'text-slate-400'}`}><iconify-icon icon="mdi:view-list" width="18" /></button>
                         </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 py-4 border-t border-slate-100">
                    <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-accent">
                        <option value="all">All Classes</option>
                        {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-accent">
                        <option value="all">All Subjects</option>
                        {uniqueSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <div className="relative flex-1 group">
                        <iconify-icon icon="mdi:magnify" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" placeholder="Search syllabus database..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-2.5 text-xs font-bold outline-none focus:border-accent focus:bg-white transition-all shadow-inner"/>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pb-24">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 opacity-20"><iconify-icon icon="mdi:loading" className="animate-spin" width="48" /></div>
                ) : (
                    <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6' : 'space-y-3'}>
                        {filteredAndSorted.map(entry => (
                            <div key={entry.id} onClick={() => setEditingEntry({...entry})} className={`bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all group cursor-pointer ${viewMode === 'list' ? 'flex items-center gap-6 py-4' : 'flex flex-col h-full'}`}>
                                <div className={`flex justify-between items-start ${viewMode === 'list' ? 'shrink-0' : 'mb-5'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className="bg-slate-900 text-white text-[10px] font-black px-3 py-1 rounded-xl uppercase shadow-lg">
                                            {entry.class_name}
                                        </div>
                                        {entry.chapter_number && <span className="text-[10px] font-black text-slate-300">CH.{entry.chapter_number}</span>}
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id!); }} className="text-slate-200 hover:text-rose-500 transition-colors"><iconify-icon icon="mdi:trash-can-outline" width="18" /></button>
                                </div>
                                <div className="flex-1">
                                    <h4 className="text-base font-black text-slate-800 uppercase tracking-tight leading-tight mb-2">{entry.chapter_name}</h4>
                                    <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-4">{entry.subject_name}</p>
                                    <div className="flex flex-wrap gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                        {entry.topic_list.split(',').slice(0, 5).map((t, i) => (
                                            <span key={i} className="text-[8px] font-bold bg-slate-50 text-slate-500 px-2 py-1 rounded-lg border border-slate-100 whitespace-nowrap">{t.trim()}</span>
                                        ))}
                                        {entry.topic_list.split(',').length > 5 && <span className="text-[8px] font-black text-slate-300">+{entry.topic_list.split(',').length - 5} MORE</span>}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* SYLLABUS CHAT ASSISTANT (Deep Discovery Core) */}
            <div className={`fixed bottom-8 right-8 z-[100] flex flex-col transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1) ${isChatOpen ? 'w-[450px] h-[650px]' : 'w-20 h-20'}`}>
                {isChatOpen ? (
                    <div className="flex-1 bg-white rounded-[3rem] shadow-[0_25px_60px_rgba(79,70,229,0.3)] border border-indigo-100 flex flex-col overflow-hidden animate-slide-up ring-1 ring-white">
                        <header className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 p-7 text-white flex justify-between items-center shrink-0 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-2 opacity-10 rotate-12">
                                <iconify-icon icon="mdi:brain" width="150" />
                            </div>
                            <div className="flex items-center gap-5 relative z-10">
                                <div className="w-12 h-12 bg-white/20 backdrop-blur-xl rounded-2xl flex items-center justify-center border border-white/30 shadow-2xl">
                                    <iconify-icon icon="mdi:robot-confused-outline" width="28" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black uppercase tracking-[0.2em]">Deep Guardian</h4>
                                    <div className="flex items-center gap-1.5 mt-1">
                                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_10px_#10b981]" />
                                        <p className="text-[8px] font-black text-indigo-100 uppercase tracking-widest">Global Discovery Active</p>
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setIsChatOpen(false)} className="w-10 h-10 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center transition-all group active:scale-90">
                                <iconify-icon icon="mdi:chevron-down" width="24" className="group-hover:translate-y-0.5 transition-transform" />
                            </button>
                        </header>
                        
                        <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-7 space-y-7 bg-[radial-gradient(circle_at_top_right,_#f8fafc,_#ffffff)] custom-scrollbar">
                            {chatHistory.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-center p-8">
                                    <div className="w-24 h-24 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center text-indigo-400 mb-8 shadow-inner border border-indigo-100/50">
                                        <iconify-icon icon="mdi:head-sync-outline" width="48" />
                                    </div>
                                    <h5 className="text-base font-black text-slate-800 uppercase tracking-widest mb-3">Knowledge Interface</h5>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed max-w-[250px]">Verify syllabus boundaries or search inside your uploaded documents.</p>
                                    
                                    <div className="mt-10 grid grid-cols-1 gap-3 w-full">
                                        <button onClick={() => setChatQuery("Is 'Linkage and Recombination' in the syllabus?")} className="px-5 py-3 bg-white border border-slate-100 rounded-2xl text-[10px] font-black text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-all text-left shadow-sm hover:shadow-indigo-100">"Is Linkage in the syllabus?"</button>
                                        <button onClick={() => setChatQuery("Search chapters for 'Human heart' details.")} className="px-5 py-3 bg-white border border-slate-100 rounded-2xl text-[10px] font-black text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-all text-left shadow-sm hover:shadow-indigo-100">"Search docs for 'Human heart'"</button>
                                    </div>
                                </div>
                            )}
                            
                            {chatHistory.map((msg, i) => (
                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                                    <div className={`max-w-[90%] px-6 py-4 rounded-[2.2rem] shadow-sm relative transition-all hover:shadow-md ${
                                        msg.role === 'user' 
                                            ? 'bg-gradient-to-br from-indigo-600 to-indigo-800 text-white rounded-tr-none border-b-4 border-indigo-900/30' 
                                            : 'bg-white border border-indigo-50 text-slate-700 rounded-tl-none font-medium border-l-4 border-l-indigo-600'
                                    }`}>
                                        <div className="text-xs leading-relaxed">
                                            {msg.role === 'assistant' ? renderAssistantReply(msg.text) : msg.text}
                                        </div>
                                        <span className={`absolute -bottom-5 text-[7px] font-black uppercase tracking-widest text-slate-300 ${msg.role === 'user' ? 'right-2' : 'left-2'}`}>
                                            {msg.role === 'user' ? 'Client' : 'Guardian'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            
                            {isChatThinking && (
                                <div className="flex justify-start animate-pulse">
                                    <div className="bg-white border border-indigo-50 px-6 py-5 rounded-[2rem] rounded-tl-none shadow-sm flex flex-col gap-3">
                                        <div className="flex gap-1.5 items-center">
                                            <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                            <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                            <div className="w-1.5 h-1.5 bg-pink-400 rounded-full animate-bounce" />
                                        </div>
                                        <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em]">Deep Content Lookup...</p>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <form onSubmit={handleChatSubmit} className="p-7 bg-white border-t border-slate-100 flex gap-4 shadow-[0_-15px_50px_rgba(0,0,0,0.03)] relative z-20">
                            <input 
                                autoFocus
                                value={chatQuery}
                                onChange={e => setChatQuery(e.target.value)}
                                placeholder="Query syllabus or chapter content..."
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-xs font-black text-slate-700 outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/5 transition-all shadow-inner placeholder:text-slate-300"
                            />
                            <button disabled={isChatThinking || !chatQuery.trim()} className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-2xl shadow-slate-900/20 hover:bg-slate-800 disabled:opacity-30 transition-all active:scale-90 group">
                                <iconify-icon icon="mdi:arrow-up" width="24" className="group-hover:-translate-y-0.5 transition-transform" />
                            </button>
                        </form>
                    </div>
                ) : (
                    <button 
                        onClick={() => setIsChatOpen(true)}
                        className="w-20 h-20 bg-slate-900 text-white rounded-[2rem] shadow-[0_20px_40px_rgba(0,0,0,0.3)] flex items-center justify-center hover:scale-110 active:scale-95 transition-all group relative border-2 border-white/20 overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/20 to-purple-600/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <iconify-icon icon="mdi:brain" width="36" className="group-hover:rotate-12 transition-transform relative z-10" />
                        <div className="absolute -top-1 -right-1 flex">
                            <div className="w-5 h-5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full border-2 border-white animate-pulse shadow-lg" />
                        </div>
                    </button>
                )}
            </div>

            {/* Editing Modal (Reuse established styles) */}
            {editingEntry && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl border border-slate-200 overflow-hidden">
                        <form onSubmit={handleSaveSyllabus}>
                            <header className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">{editingEntry.id ? 'Refine Knowledge Node' : 'Initialize Chapter'}</h3>
                                <button type="button" onClick={handleCloseModal} className="w-10 h-10 rounded-full bg-white text-slate-400 hover:text-rose-500 shadow-sm border border-slate-100 flex items-center justify-center transition-all active:scale-90"><iconify-icon icon="mdi:close" width="20" /></button>
                            </header>
                            <div className="p-10 space-y-8 max-h-[65vh] overflow-y-auto custom-scrollbar">
                                <div className="grid grid-cols-2 gap-6">
                                    <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Class</label><input required value={editingEntry.class_name} onChange={e => setEditingEntry(p => p ? {...p, class_name: e.target.value} : null)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3.5 text-sm font-black text-slate-700 outline-none focus:border-indigo-500 transition-all shadow-inner" /></div>
                                    <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Subject</label><input required value={editingEntry.subject_name} onChange={e => setEditingEntry(p => p ? {...p, subject_name: e.target.value} : null)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3.5 text-sm font-black text-slate-700 outline-none focus:border-indigo-500 transition-all shadow-inner" /></div>
                                </div>
                                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Chapter Identity</label><input required value={editingEntry.chapter_name} onChange={e => setEditingEntry(p => p ? {...p, chapter_name: e.target.value} : null)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3.5 text-sm font-black text-slate-700 outline-none focus:border-indigo-500 transition-all shadow-inner" /></div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">AUTHORIZED TOPICS (Comma Separated)</label>
                                    <textarea required rows={5} value={editingEntry.topic_list} onChange={e => setEditingEntry(p => p ? {...p, topic_list: e.target.value} : null)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-[2rem] px-6 py-5 text-xs font-bold text-slate-600 outline-none focus:border-indigo-500 transition-all shadow-inner resize-none" />
                                </div>
                            </div>
                            <footer className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end gap-4">
                                <button type="button" onClick={handleCloseModal} className="px-8 py-3 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 transition-colors">Abort</button>
                                <button type="submit" disabled={isSaving} className="px-10 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-slate-900/20 hover:bg-slate-800 disabled:opacity-50 transition-all active:scale-95">
                                    {isSaving ? "Syncing..." : "Commit Node"}
                                </button>
                            </footer>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SyllabusManager;