"use client";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { API_SCOPE_OPTIONS, CreateApiKeySchema, MAX_API_KEYS } from "@/generated/public-api";
import { WEBHOOK_EVENTS, CreateWebhookSchema, MAX_WEBHOOK_ENDPOINTS } from "@/generated/webhooks";
import { ApiError } from "@/services/api-client";
import * as api from "@/services/integrations";
import styles from "./integrations.module.css";
type Operation={kind:"key";input:z.input<typeof CreateApiKeySchema>}|{kind:"hook";input:z.input<typeof CreateWebhookSchema>}|{kind:"revoke"|"disable";id:string};
export function Integrations(){const {userId,sessionId}=useAuth();return userId&&sessionId?<IntegrationSettings key={`${userId}:${sessionId}`} userId={userId}/>:null;}
export function IntegrationSettings({userId}:{userId:string}){
 const {getToken}=useAuth(),client=useQueryClient(),lifetime=useRef<AbortController|null>(null);
 const [secret,setSecret]=useState<{label:string;value:string}|null>(null),[revealed,setRevealed]=useState(false),[notice,setNotice]=useState("");
 const secretField=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(secret)secretField.current?.focus();},[secret]);
 const [selected,setSelected]=useState<string|null>(null),keyRequest=useRef<string|null>(null),hookRequest=useRef<string|null>(null);
 useEffect(()=>{const controller=new AbortController();lifetime.current=controller;return()=>controller.abort();},[]);
 const keys=useQuery({queryKey:api.integrationKeys.keys(userId),queryFn:({signal})=>api.listKeys(()=>getToken(),signal)});
 const hooks=useQuery({queryKey:api.integrationKeys.hooks(userId),queryFn:({signal})=>api.listHooks(()=>getToken(),signal)});
 const mutation=useMutation<void,Error,Operation>({retry:false,networkMode:"always",mutationFn:async operation=>{
  const signal=lifetime.current?.signal,token=()=>getToken();
  if(operation.kind==="key"||operation.kind==="hook"){
   const result=operation.kind==="key"?await api.createKey(operation.input,token,signal):await api.createHook(operation.input,token,signal);
   if(signal?.aborted)return;
   // One-time credentials live only in this mounted session, never in the query
   // or mutation cache, browser storage, URLs, or log messages.
   setSecret({label:operation.kind==="key"?"API key":"Webhook signing secret",value:result.secret});setRevealed(false);
   if(operation.kind==="key")keyRequest.current=null;else hookRequest.current=null;
  }else if(operation.kind==="revoke")await api.revokeKey(operation.id,token,signal);
  else await api.disableHook(operation.id,token,signal);
 },onSettled:()=>{if(!lifetime.current?.signal.aborted)void client.invalidateQueries({queryKey:api.integrationKeys.all(userId)});}});
 function submit(event:FormEvent<HTMLFormElement>,kind:"key"|"hook"){
  event.preventDefault();setNotice("");const form=new FormData(event.currentTarget);
  if(kind==="key"){
   keyRequest.current??=crypto.randomUUID();const input=CreateApiKeySchema.safeParse({requestId:keyRequest.current,name:form.get("name"),scopes:form.getAll("scopes")});
   if(!input.success){setNotice("Enter a key name and select at least one permission.");return;}mutation.mutate({kind,input:input.data});
  }else{
   hookRequest.current??=crypto.randomUUID();const input=CreateWebhookSchema.safeParse({requestId:hookRequest.current,url:form.get("url"),events:form.getAll("events")});
   if(!input.success){setNotice("Enter a public HTTPS URL and select at least one event.");return;}mutation.mutate({kind,input:input.data});
  }
 }
 const busy=mutation.isPending||!!secret;
 return <div className={styles.scroll}><div className={styles.page}>
  <header><p className={styles.eyebrow}>Developer settings</p><h1>API & webhooks</h1><p>Connect your tools to durable conversations and media work.</p></header>
  {notice?<p role="alert">{notice}</p>:null}
  {mutation.isError?<div role="alert"><p>{mutation.error instanceof ApiError?mutation.error.message:"This change could not be saved."}</p><p>If creation was interrupted, refresh the list and remove the new entry before creating another.</p><button onClick={()=>{keyRequest.current=null;hookRequest.current=null;mutation.reset();void client.invalidateQueries({queryKey:api.integrationKeys.all(userId)});}}>Refresh and clear request</button></div>:null}
  {secret?<section className={styles.secret} aria-label="Save your secret"><h2>Save your {secret.label.toLowerCase()}</h2><p>This secret appears once. Save it securely before dismissing.</p><label>{secret.label}<input ref={secretField} type={revealed?"text":"password"} value={secret.value} readOnly autoComplete="off" spellCheck={false}/></label><div className={styles.actions}><button onClick={()=>setRevealed(value=>!value)}>{revealed?"Hide secret":"Reveal secret"}</button><button onClick={()=>{setSecret(null);setRevealed(false);}}>I saved it</button></div></section>:null}
  <section><h2>API keys</h2><p>Choose the permissions this integration needs. Keys expire after {CreateApiKeySchema.shape.expiresInDays.parse(undefined)} days.</p>
   <form onSubmit={event=>submit(event,"key")}><fieldset disabled={busy||!keys.data||keys.data.items.length>=MAX_API_KEYS}><label>Key name<input name="name" required maxLength={CreateApiKeySchema.shape.name.maxLength??undefined} placeholder="My integration"/></label><legend className={styles.srOnly}>Create an API key</legend><div className={styles.options}>{API_SCOPE_OPTIONS.map(scope=><label key={scope}><input type="checkbox" name="scopes" value={scope} defaultChecked={scope==="chats:read"}/>{scope}</label>)}</div><button type="submit">Create API key</button></fieldset></form>
   <QueryState pending={keys.isPending} error={keys.error} retry={()=>void keys.refetch()}/>
   {keys.data?.items.length===0?<p>No active API keys.</p>:null}
   <ul>{keys.data?.items.map(key=><li key={key.id}><div><strong>{key.name}</strong><code>{key.prefix}…</code><span>Expires {new Date(key.expiresAt).toLocaleDateString()}</span><span>{key.scopes.join(", ")}</span></div><button disabled={busy} onClick={()=>mutation.mutate({kind:"revoke",id:key.id})} aria-label={`Revoke ${key.name}`}>Revoke</button></li>)}</ul>
  </section>
  <section><h2>Webhook endpoints</h2><p>Receive signed events when work starts or finishes. Disabling an endpoint stops pending deliveries.</p>
   {hooks.data&&!hooks.data.configured?<p role="status">Webhooks are not configured yet.</p>:null}
   <form onSubmit={event=>submit(event,"hook")}><fieldset disabled={busy||!hooks.data?.configured||hooks.data.items.length>=MAX_WEBHOOK_ENDPOINTS}><legend className={styles.srOnly}>Create a webhook endpoint</legend><label>Endpoint URL<input name="url" type="url" required placeholder="https://your-app.example/webhooks"/></label><div className={styles.options}>{WEBHOOK_EVENTS.map(type=><label key={type}><input type="checkbox" name="events" value={type} defaultChecked={type==="agent.completed"}/>{type}</label>)}</div><button type="submit">Create webhook</button></fieldset></form>
   <QueryState pending={hooks.isPending} error={hooks.error} retry={()=>void hooks.refetch()}/>
   {hooks.data?.items.length===0?<p>No active webhook endpoints.</p>:null}
   <ul>{hooks.data?.items.map(endpoint=><li key={endpoint.id}><div><strong className={styles.url}>{endpoint.url}</strong><span>{endpoint.events.join(", ")}</span><button aria-expanded={selected===endpoint.id} onClick={()=>setSelected(value=>value===endpoint.id?null:endpoint.id)}>Delivery history</button></div><button disabled={busy} onClick={()=>mutation.mutate({kind:"disable",id:endpoint.id})} aria-label={`Disable ${endpoint.url}`}>Disable</button></li>)}</ul>
   {selected?<DeliveryHistory key={selected} userId={userId} endpointId={selected}/>:null}
  </section>
  {mutation.isPending?<p role="status">Saving your change…</p>:null}
 </div></div>;
}
function QueryState({pending,error,retry}:{pending:boolean;error:Error|null;retry:()=>void}){return pending?<p role="status">Loading…</p>:error?<div role="alert"><p>{error instanceof ApiError?error.message:"Unable to load this list."}</p><button onClick={retry}>Try again</button></div>:null;}
function DeliveryHistory({userId,endpointId}:{userId:string;endpointId:string}){
 const {getToken}=useAuth();const query=useInfiniteQuery({queryKey:api.integrationKeys.deliveries(userId,endpointId),queryFn:({signal,pageParam})=>api.listDeliveries(endpointId,()=>getToken(),pageParam,signal),initialPageParam:undefined as string|undefined,getNextPageParam:page=>page.nextCursor??undefined});
 const rows=query.data?.pages.flatMap(page=>page.items)??[];
 return <section aria-label="Webhook delivery history"><div className={styles.actions}><h3>Delivery history</h3><button disabled={query.isFetching} onClick={()=>void query.refetch()}>Refresh deliveries</button></div><QueryState pending={query.isPending} error={query.error} retry={()=>void query.refetch()}/>{query.isSuccess&&!rows.length?<p>No deliveries yet. New events will appear here.</p>:null}<ul>{rows.map(row=><li key={row.id}><div><strong>{row.type} · {row.status}</strong><span>{row.attempts} attempts{row.responseStatus?` · HTTP ${row.responseStatus}`:""}</span><time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString()}</time>{row.error?<p>{row.error}</p>:null}</div></li>)}</ul>{query.hasNextPage?<button disabled={query.isFetching} onClick={()=>void query.fetchNextPage()}>Load older deliveries</button>:null}</section>;
}
