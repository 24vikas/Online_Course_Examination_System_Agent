import { z } from "zod";

// Base Identifier Schema
export const UUIDSchema = z.string().uuid();

// Institution / Tenant
export const TenantSchema = z.object({
  id: UUIDSchema,
  code: z.string().min(2).max(32),
  name: z.string().min(2).max(255),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Tenant = z.infer<typeof TenantSchema>;

// Academic Year (e.g., "AY 2026-27")
export const AcademicYearSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  yearName: z.string().min(4).max(64),
  startDate: z.string().date(),
  endDate: z.string().date(),
});
export type AcademicYear = z.infer<typeof AcademicYearSchema>;

// Academic Term / Semester (e.g., "Odd Term 2026", "Semester 3")
export const AcademicTermSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  academicYearId: UUIDSchema,
  termCode: z.string().min(2).max(32),
  termName: z.string().min(2).max(128),
  semesterNumber: z.number().int().min(1).max(12),
  isActive: z.boolean().default(true),
});
export type AcademicTerm = z.infer<typeof AcademicTermSchema>;

// Program / Department (e.g., "School of Computer Science & Engineering")
export const ProgramSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  code: z.string().min(2).max(32),
  name: z.string().min(2).max(255),
});
export type Program = z.infer<typeof ProgramSchema>;

// Batch / Cohort / Section (e.g., "CSE-2024-28-SEC-A")
export const BatchSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  programId: UUIDSchema,
  batchCode: z.string().min(2).max(64),
  batchName: z.string().min(2).max(128),
  admissionYear: z.number().int().min(2000).max(2100),
  section: z.string().max(16).optional(),
});
export type Batch = z.infer<typeof BatchSchema>;

// Student Profile (Institutional Identity)
export const StudentProfileSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  institutionalStudentId: z.string().min(2).max(64), // e.g. Roll number / USN (unique per tenant)
  firstName: z.string().min(1).max(128),
  lastName: z.string().max(128).default(""),
  email: z.string().email(),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
});
export type StudentProfile = z.infer<typeof StudentProfileSchema>;

// Student Batch Membership (Decoupled from course enrolments)
export const StudentBatchMembershipSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  studentId: UUIDSchema,
  batchId: UUIDSchema,
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().optional(),
  status: z.enum(["ACTIVE", "COMPLETED", "TRANSFERRED", "SUSPENDED"]).default("ACTIVE"),
});
export type StudentBatchMembership = z.infer<typeof StudentBatchMembershipSchema>;

// Master Course Catalogue
export const MasterCourseSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  programId: UUIDSchema,
  courseCode: z.string().min(2).max(32), // e.g. "26ECAC203", "CS201"
  courseTitle: z.string().min(2).max(255),
  credits: z.number().min(0).max(20),
});
export type MasterCourse = z.infer<typeof MasterCourseSchema>;

// Course Offering (Instance in specific term, section, and lecturer)
export const CourseOfferingSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  masterCourseId: UUIDSchema,
  academicTermId: UUIDSchema,
  section: z.string().max(16).default("A"),
  primaryLecturerId: UUIDSchema,
  isActive: z.boolean().default(true),
});
export type CourseOffering = z.infer<typeof CourseOfferingSchema>;

// Student Course Registration / Enrolment (Maintained separately from batch)
export const CourseEnrollmentSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  studentId: UUIDSchema,
  courseOfferingId: UUIDSchema,
  enrollmentStatus: z.enum(["ENROLLED", "AUDIT", "DROPPED", "WITHDRAWN"]).default("ENROLLED"),
  registrationDate: z.string().datetime(),
});
export type CourseEnrollment = z.infer<typeof CourseEnrollmentSchema>;
