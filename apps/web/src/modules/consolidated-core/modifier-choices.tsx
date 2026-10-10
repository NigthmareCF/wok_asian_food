"use client";
import {useEffect,useState} from "react";
import {isGroups,type ModifierGroup} from "./contract";
export function ModifierChoices({menuItemId,selected,onChange}:{menuItemId:string;selected:string[];onChange:(v:string[])=>void}) {
 const [groups,setGroups]=useState<ModifierGroup[]>([]);const [error,setError]=useState("");
 useEffect(()=>{const abort=new AbortController();fetch(`/bff/core/public/menu/${menuItemId}/modifiers`,{signal:abort.signal}).then(r=>{if(!r.ok)throw Error("No pudimos consultar las opciones.");return r.json();}).then((v:unknown)=>{if(!isGroups(v))throw Error("Opciones inválidas.");setGroups(v);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);});return()=>abort.abort();},[menuItemId]);
 return <div>{groups.map(group=><fieldset key={group.id}><legend>{group.name} · {group.required?"obligatorio":"opcional"} · {group.minSelection}–{group.maxSelection}</legend>{group.options.map(option=><label key={option.id}><input type="checkbox" checked={selected.includes(option.id)} onChange={e=>onChange(e.target.checked?[...selected,option.id]:selected.filter(id=>id!==option.id))}/>{option.name} (+{option.priceDelta.toFixed(2)})</label>)}</fieldset>)}{error?<p role="alert">{error}</p>:null}</div>;
}
