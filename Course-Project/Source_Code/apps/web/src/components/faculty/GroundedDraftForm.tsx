import { useEffect, useState, type FormEvent } from "react";

type Passage = {id:string; syllabus_version_id:string; page_start:number; excerpt:string};
type Topic = {topic_id:string; syllabus_version_id:string; unit_number:number; topic_title:string};
type Outcome = {id:string; syllabus_version_id:string; outcome_code:string};
type Sources = {passages:Passage[]; syllabusStructure:{units:Topic[]; outcomes:Outcome[]}};

export function GroundedDraftForm({offeringId}:{offeringId:string}) {
  const [sources,setSources]=useState<Sources|null>(null);
  const [chunkId,setChunkId]=useState("");
  const [status,setStatus]=useState("");
  const [draftId,setDraftId]=useState<string|null>(null);
  const [saving,setSaving]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/lecturer/question-bank?authoring=true&courseOfferingId="+encodeURIComponent(offeringId),{signal:controller.signal})
      .then(async response=>{
        if (!response.ok) throw new Error("Could not load syllabus passages");
        setSources(await response.json());
      }).catch(error=>{if (error.name!=="AbortError") setStatus(error.message);});
    return ()=>controller.abort();
  },[offeringId]);
  const passage=sources?.passages.find(item=>item.id===chunkId);
  const syllabus=passage?.syllabus_version_id;
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!syllabus || saving) return;
    const form=event.currentTarget;
    const fields=Object.fromEntries(new FormData(form));
    setSaving(true);
    setStatus("");
    try {
      const response=await fetch("/api/lecturer/question-bank",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        courseOfferingId:offeringId,question:{...fields,chunkId,syllabusVersionId:syllabus,marks:Number(fields.marks),questionType:"SHORT_ANSWER"}
      })});
      const result=await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save draft");
      setDraftId(result.questionIds[0]);
      form.reset();
      setChunkId("");
      setStatus("Draft saved");
    } catch(error) {setStatus((error as Error).message);}
    finally {setSaving(false);}
  }
  async function submit() {
    if (!draftId || saving) return;
    setSaving(true);
    try {
      const response=await fetch("/api/lecturer/question-bank",{method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({questionId:draftId,action:"SUBMIT_FOR_REVIEW"})});
      const result=await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit draft");
      setDraftId(null);
      setStatus("Pending COE approval");
    } catch(error) {setStatus((error as Error).message);}
    finally {setSaving(false);}
  }
  return <form onSubmit={save} aria-label="Author syllabus-grounded question" className="space-y-3 rounded-lg border bg-white p-4">
    <h2 className="font-semibold">Author syllabus-grounded question</h2>
    <label className="block">Syllabus passage <select required value={chunkId} onChange={e=>setChunkId(e.target.value)}>
      <option value="">Select a passage</option>{sources?.passages.map(item=><option key={item.id} value={item.id}>Page {item.page_start} · {item.excerpt.slice(0,100)}</option>)}
    </select></label>
    {passage && <blockquote>{passage.excerpt}</blockquote>}
    <label className="block">Topic <select key={chunkId+"topic"} name="topicId" aria-label="Topic" required><option value="">Select a topic</option>
      {sources?.syllabusStructure.units.filter(t=>t.syllabus_version_id===syllabus && t.topic_id).map(t=><option key={t.topic_id} value={t.topic_id}>Unit {t.unit_number} · {t.topic_title}</option>)}
    </select></label>
    <label className="block">Course outcome <select key={chunkId+"outcome"} name="courseOutcomeId" aria-label="Course outcome" required><option value="">Select an outcome</option>
      {sources?.syllabusStructure.outcomes.filter(o=>o.syllabus_version_id===syllabus).map(o=><option key={o.id} value={o.id}>{o.outcome_code}</option>)}
    </select></label>
    <label className="block">Bloom level <select name="bloomLevel">{["REMEMBER","UNDERSTAND","APPLY","ANALYZE","EVALUATE","CREATE"].map(level=><option key={level}>{level}</option>)}</select></label>
    <label className="block">Difficulty <select name="difficulty"><option>EASY</option><option>MEDIUM</option><option>HARD</option></select></label>
    <label className="block">Marks <input name="marks" type="number" min="0.01" step="0.01" required className="border"/></label>
    <label className="block">Question <textarea name="questionText" required className="block w-full border"/></label>
    <label className="block">Answer key <textarea name="correctAnswer" required className="block w-full border"/></label>
    <button type="submit" disabled={!passage || saving} className="rounded bg-red-900 px-3 py-2 text-white disabled:opacity-50">Save grounded draft</button>
    {draftId && <button type="button" onClick={submit} disabled={saving} className="ml-3 rounded border px-3 py-2">Submit draft to COE</button>}
    <p role="status">{status}</p>
  </form>;
}
