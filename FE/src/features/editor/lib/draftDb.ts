import type { EditorDraftRecord } from '../types'

  const DB_NAME = 'batang-editor'
  const STORE_NAME = 'project-drafts'
  const DB_VERSION = 1                                                                                                                                      
                                                                                                                                                            
  let dbPromise: Promise<IDBDatabase> | null = null                                                                                                         
                                                                                                                                                            
  function openDraftDb(): Promise<IDBDatabase> {                                                                                                            
    if (dbPromise) return dbPromise                                                                                                                         
                                                                                                                                                            
    dbPromise = new Promise((resolve, reject) => {                                                                                                          
      const request = window.indexedDB.open(DB_NAME, DB_VERSION)                                                                                            
                                                                                                                                                            
      request.onupgradeneeded = () => {                                                                                                                     
        const db = request.result                                                                                                                           
                                                                                                                                                            
        if (!db.objectStoreNames.contains(STORE_NAME)) {                                                                                                    
          db.createObjectStore(STORE_NAME, { keyPath: 'projectId' })                                                                                        
        }                                                                                                                                                   
      }                                                                                                                                                     
                                                                                                                                                            
      request.onsuccess = () => resolve(request.result)                                                                                                     
      request.onerror = () => reject(request.error)                                                                                                         
    })                                                                                                                                                      
                                                                                                                                                            
    return dbPromise                                                                                                                                        
  }                                                                                                                                                         
                                                                                                                                                            
  /** 프로젝트별 자동저장 draft를 조회한다. */                                                                                                              
  export async function getDraft(projectId: string): Promise<EditorDraftRecord | null> {                                                                    
    const db = await openDraftDb()                                                                                                                          
                                                                                                                                                            
    return new Promise((resolve, reject) => {                                                                                                               
      const request = db                                                                                                                                    
        .transaction(STORE_NAME, 'readonly')                                                                                                                
        .objectStore(STORE_NAME)                                                                                                                            
        .get(projectId)                                                                                                                                     
                                                                                                                                                            
      request.onsuccess = () => resolve((request.result as EditorDraftRecord | undefined) ?? null)                                                          
      request.onerror = () => reject(request.error)                                                                                                         
    })                                                                                                                                                      
  }                                                                                                                                                         
                                                                                                                                                            
  /** 프로젝트별 자동저장 draft를 저장하거나 덮어쓴다. */                                                                                                   
  export async function setDraft(projectId: string, draft: EditorDraftRecord): Promise<void> {                                                              
    const db = await openDraftDb()                                                                                                                          
                                                                                                                                                            
    return new Promise((resolve, reject) => {                                                                                                               
      const request = db                                                                                                                                    
        .transaction(STORE_NAME, 'readwrite')                                                                                                               
        .objectStore(STORE_NAME)                                                                                                                            
        .put({ ...draft, projectId })                                                                                                                       
                                                                                                                                                            
      request.onsuccess = () => resolve()                                                                                                                   
      request.onerror = () => reject(request.error)                                                                                                         
    })                                                                                                                                                      
  }                                                                                                                                                         
                                                                                                                                                            
  /** 프로젝트별 자동저장 draft를 삭제한다. */                                                                                                              
  export async function deleteDraft(projectId: string): Promise<void> {                                                                                     
    const db = await openDraftDb()                                                                                                                          
                                                                                                                                                            
    return new Promise((resolve, reject) => {                                                                                                               
      const request = db                                                                                                                                    
        .transaction(STORE_NAME, 'readwrite')                                                                                                               
        .objectStore(STORE_NAME)                                                                                                                            
        .delete(projectId)                                                                                                                                  
                                                                                                                                                            
      request.onsuccess = () => resolve()                                                                                                                   
      request.onerror = () => reject(request.error)                                                                                                         
    })                                                                                                                                                      
  }                                                                                           