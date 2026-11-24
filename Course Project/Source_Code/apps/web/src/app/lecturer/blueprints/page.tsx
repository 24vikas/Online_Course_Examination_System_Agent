"use client";

import {useEffect,useState,type FormEvent} from "react";
import {AuthGuard} from "@/components/auth/AuthGuard";

type Offering = {offeringId:string; courseCode:string; courseTitle:string};
type Question = {id:string; prompt:string; marks:number; syllabusVersionId:string; reviewStatus:string};
type Blueprint = {id:string; title:string; status:string};

export default function FacultyBlueprints() {
  return <AuthGuard allowedRoles={["LECTURER","FACULTY"]}><BlueprintEditor /></AuthGuard>;
}

function BlueprintEditor() {
  const [offerings,setOfferings]=useState<Offering[]>([]);
  const [questions,setQuestions]=useState<Question[]>([]);
  const [blueprints,setBlueprints]=useState<Blueprint[]>([]);
  const [offering,setOffering]=useState("");
  const [selected,setSelected]=useState<string[]>([]);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  async function read(path:string,signal?:AbortSignal) {
    const response=await fetch(path,{cache:"no-store",signal});
    if (!response.ok) throw new Error("Could not load blueprint data");
    return response.json();
  }
  useEffect(()=>{
    const controller=new AbortController();
    Promise.all([read("/api/lecturer/question-bank",controller.signal),read("/api/lecturer/blueprints",controller.signal)])
      .then(([bank,plans])=>{
        const courses=[...new Map<string,Offering>(bank.offerings.map((item:Offering)=>[item.offeringId,item])).values()];
        setOfferings(courses);
        setBlueprints(plans.blueprints);
      }).catch(error=>{if(error.name!=="AbortError") setMessage(error.message);});
    return ()=>controller.abort();
  },[]);
  useEffect(()=>{
    if(!offering) return;
    const controller=new AbortController();
    read("/api/lecturer/question-bank?reviewStatus=PENDING_COE_APPROVAL&courseOfferingId="+encodeURIComponent(offering),controller.signal)
      .then(bank=>setQuestions(bank.questions))
      .catch(error=>{if(error.name!=="AbortError") setMessage(error.message);});
    return ()=>controller.abort();
  },[offering]);
  const chosen=questions.filter(question=>selected.includes(question.id));
  const totalMarks=chosen.reduce((sum,question)=>sum+question.marks,0);
  const syllabus=chosen[0]?.syllabusVersionId;

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!syllabus || busy) return;
    const fields=new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const response=await fetch("/api/lecturer/blueprints",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        courseOfferingId:offering,syllabusVersionId:syllabus,title:fields.get("title"),durationMinutes:Number(fields.get("duration")),
        totalMarks,sections:[{name:"Section A",marks:totalMarks,questionIds:selected}],submitForReview:true
      })});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error || "Could not submit blueprint");
      setBlueprints(current=>[result.blueprint,...current]);
      setSelected([]);
      setMessage("Blueprint submitted to COE");
    }catch(error){setMessage((error as Error).message);}
    finally{setBusy(false);}
  }
  return <main className="mx-auto max-w-4xl space-y-5 p-6">
    <h1 className="text-2xl font-bold">Blueprints and planning</h1>
    <form className="space-y-4 rounded-lg border bg-white p-5" onSubmit={submit}>
      <label className="block">Course offering <select aria-label="Course offering" required value={offering} onChange={event=>{
        setQuestions([]);setSelected([]);setOffering(event.target.value);
      }}><option value="">Select a course</option>{offerings.map(item=><option key={item.offeringId} value={item.offeringId}>{item.courseCode} · {item.courseTitle}</option>)}</select></label>
      <label className="block">Blueprint title <input name="title" required maxLength={255} className="border"/></label>
      <label className="block">Duration in minutes <input name="duration" type="number" required min={5} max={360} defaultValue={30} className="border"/></label>
      <fieldset>
        <legend className="font-semibold">Questions pending COE approval</legend>
        {offering && !questions.length && <p>No submitted questions found for this offering.</p>}
        {questions.map(question=><label key={question.id} className="block py-1">
          <input type="checkbox" checked={selected.includes(question.id)} disabled={Boolean(syllabus && syllabus!==question.syllabusVersionId)}
            onChange={event=>setSelected(current=>event.target.checked?[...current,question.id]:current.filter(id=>id!==question.id))}/>{" "}
          {question.prompt} ({question.marks} marks)
        </label>)}
      </fieldset>
      <p>Total marks from selected questions: {totalMarks}</p>
      <button className="rounded bg-red-900 px-3 py-2 text-white disabled:opacity-50" disabled={!chosen.length || busy}>Submit blueprint to COE</button>
      <p role="status">{message}</p>
    </form>
    <section><h2 className="font-semibold">Your blueprints</h2>
      <ul>{blueprints.map(item=><li key={item.id}>{item.title} · {item.status}</li>)}</ul>
    </section>
  </main>;
}
