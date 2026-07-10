import {
    billingStatementRepository,
  } from "./repository";
  
  export class ApprovalService {
  
    static submit(
      id: string,
      submittedBy: string
    ) {
  
      const statement =
        billingStatementRepository.getById(id);
  
      if (!statement) {
        return;
      }
  
      statement.approvalStatus =
        "Pending Approval";
  
      statement.submittedBy =
        submittedBy;
  
      statement.submittedAt =
        new Date().toISOString();
  
      statement.version++;
  
      billingStatementRepository.update(
        statement
      );
  
    }
  
    static approve(
      id: string,
      approvedBy: string
    ) {
  
      const statement =
        billingStatementRepository.getById(id);
  
      if (!statement) {
        return;
      }
  
      statement.approvalStatus =
        "Approved";
  
      statement.approvedBy =
        approvedBy;
  
      statement.approvedAt =
        new Date().toISOString();
  
      statement.version++;
  
      billingStatementRepository.update(
        statement
      );
  
    }
  
    static reject(
  
      id: string,
  
      rejectedBy: string,
  
      remarks: string
  
    ) {
  
      const statement =
        billingStatementRepository.getById(id);
  
      if (!statement) {
        return;
      }
  
      statement.approvalStatus =
        "Rejected";
  
      statement.rejectedBy =
        rejectedBy;
  
      statement.rejectedAt =
        new Date().toISOString();
  
      statement.rejectionRemarks =
        remarks;
  
      statement.version++;
  
      billingStatementRepository.update(
        statement
      );
  
    }
  
  }