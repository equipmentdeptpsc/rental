import type { Operator } from "../types";
export type OperatorCertification=NonNullable<Operator["certificationTypes"]>[number];
export function normalizeOperatorCertifications(operator:Pick<Operator,"certificationType"|"certificationTypes">):OperatorCertification[]{return [...new Set(operator.certificationTypes?.length?operator.certificationTypes:operator.certificationType!=="None"?[operator.certificationType]:[])]}
export function addOperatorCertification(current:readonly OperatorCertification[],certification:OperatorCertification):OperatorCertification[]{return current.includes(certification)?[...current]:[...current,certification]}
export function removeOperatorCertification(current:readonly OperatorCertification[],certification:OperatorCertification):OperatorCertification[]{return current.filter(item=>item!==certification)}
