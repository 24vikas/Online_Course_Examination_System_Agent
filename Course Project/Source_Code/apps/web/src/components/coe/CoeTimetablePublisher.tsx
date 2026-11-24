"use client";

import {useEffect,useState,type FormEvent} from "react";

type Blueprint = {id:string;title:string;status:string};

export function CoeTimetablePublisher() {
  const [invigilators,setInvigilators]=useState<{id:string;email:string}[]>([]);
  const [approved,setApproved]=useState<Blueprint[]>([]);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/coe/blueprints",{signal:controller.signal}).then(async response=>{
      if (!response.ok) throw new Error("Could not load approved blueprints");
      const result=await response.json();
      setApproved(result.blueprints.filter((item:Blueprint)=>item.status==="APPROVED"));
    }).catch(error=>{if(error.name!=="AbortError") setMessage(error.message);});
    fetch("/api/coe/schedules",{signal:controller.signal}).then(async response=>{
      if (!response.ok) throw new Error("Could not load invigilators");
      setInvigilators((await response.json()).invigilators);
    }).catch(error=>{if(error.name!=="AbortError") setMessage(error.message);});
    return ()=>controller.abort();
  },[]);
  async function publish(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values=new FormData(event.currentTarget);
    const blueprintId=values.get("blueprintId");
    setBusy(true);
    setMessage("");
    try {
      const response=await fetch("/api/coe/schedules",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        blueprintId,invigilatorMembershipId:values.get("invigilator"),startTime:new Date(String(values.get("startTime"))).toISOString(),
        endTime:new Date(String(values.get("endTime"))).toISOString(),
      })});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error || "Could not publish timetable");
      setMessage("Timetable published for "+result.schedule.title);
      setApproved(current=>current.filter(item=>item.id!==blueprintId));
    } catch(error){setMessage((error as Error).message);}
    finally{setBusy(false);}
  }
  return <section className="mx-auto max-w-5xl space-y-3 rounded-lg border bg-white p-5">
    <h2 className="text-lg font-semibold">Publish examination timetable</h2>
    <form onSubmit={publish} className="space-y-3">
      <label className="block">Approved blueprint <select aria-label="Approved blueprint" name="blueprintId" required>
        <option value="">Select a blueprint</option>{approved.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
      </select></label>
      <label className="block">Invigilator <select aria-label="Invigilator" name="invigilator" required><option value="">Select an invigilator</option>{invigilators.map(item=><option value={item.id} key={item.id}>{item.email}</option>)}</select></label>
      <p>Times use the browser timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
      <label className="block">Start time <input type="datetime-local" name="startTime" required/></label>
      <label className="block">End time <input type="datetime-local" name="endTime" required/></label>
      <button disabled={busy || !approved.length} className="rounded bg-red-900 px-3 py-2 text-white disabled:opacity-50">Publish timetable</button>
      <p role="status">{message}</p>
    </form>
  </section>;
}
