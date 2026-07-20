import Button from "@/components/ui/Button";
import { useAuth } from "@/features/auth/AuthContext";
import { useToast } from "@/components/ui/toast/ToastContext";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import type { DeurRecord } from "@/features/rental/deur/types";
export default function SubmitEvidenceButton({deur}:{deur:DeurRecord}){const {user}=useAuth(),{showToast}=useToast();if(deur.evidenceMode==="TIME_TIMELINE"||!deur.evidenceMode||!["Draft","In Progress"].includes(deur.status))return null;function submit(){const result=deurRepository.submit(deur.id,{id:user?.id,name:user?.name??"Operator"});showToast(result.success?"DEUR submitted for acknowledgement.":result.message,result.success?"success":"error")}return <Button type="button" variant="success" onClick={submit}>{deur.evidenceMode==="ODOMETER_TRIP"?"END SHIFT AND SUBMIT":"SUBMIT"}</Button>}
