import { createBrowserRouter, Navigate } from 'react-router-dom';

import HRDashboard from '@/pages/hr/Dashboard/Dashboard';
import Applications from '@/pages/hr/Applications/Applications';
import Internships from '@/pages/hr/Internships/Internships';
import ApplicationDetails from '@/pages/hr/ApplicationDetails/ApplicationDetails';
import TrainingPlanning from '@/pages/hr/TrainingPlanning/TrainingPlanning';
import InternProgressPage from '@/pages/hr/InternProgress/InternProgress';

import Apply from '@/pages/public/Apply/Apply';
import ApplicationReview from '@/pages/public/ApplicationReview/ApplicationReview';
import PublicInternships from '@/pages/public/Internships/Internships';

import Login from '@/features/auth/Login';
import ApplicantProfile from '@/pages/applicant/Profile/ApplicantProfile';
import RoleGuard from '@/features/auth/RoleGuard';
import InternRoute from '@/features/intern/InternRoute';
import HomePage from '@/pages/public/Home/HomePage';
import NotFoundPage from '@/pages/public/NotFound/NotFoundPage';
import HRLayout from '@/components/layout/HRLayout/HRLayout';
import InternDashboard from '@/pages/intern/Dashboard/InternDashboard';
import MyInternship from '@/pages/intern/MyInternship/MyInternship';
import AssignedTasks from '@/pages/intern/Tasks/AssignedTasks';
import TrainingReports from '@/pages/intern/TrainingReports/TrainingReports';
import InternProfile from '@/pages/intern/Profile/InternProfile';
import MentorLayout from '@/components/layout/MentorLayout/MentorLayout';
import MentorDashboard from '@/pages/mentor/Dashboard/MentorDashboard';
import AdminLayout from '@/components/layout/AdminLayout/AdminLayout';
import AdminDashboard from '@/pages/admin/Dashboard/AdminDashboard';
import UserManagement from '@/pages/admin/Users/UserManagement';
import RolesPermissions from '@/pages/admin/Roles/RolesPermissions';
import SystemSettings from '@/pages/admin/Settings/SystemSettings';


/* =========================================================
   Router
   ========================================================= */

   export const router =
   createBrowserRouter([
     {
       path: '/',
       element: <HomePage />,
     },
 
     {
       path: '/apply',
       element: <Apply />,
     },
 
     {
       path:
         '/application-review/:reviewToken',
 
       element:
         <ApplicationReview />,
     },
 
     {
       path: '/hr',
 
       element: (
         <RoleGuard
           allowedRoles={[
             'HR',
           ]}
         >
           <HRLayout />
         </RoleGuard>
       ),
 
       children: [
         {
           index: true,
           element: <Navigate to="dashboard" replace />,
         },

         {
           path:
             'dashboard',
 
           element:
             <HRDashboard />,
         },
 
         {
           path:
             'applications',
 
           element:
             <Applications />,
         },
 
         {
           path:
             'applications/:id',
 
           element:
             <ApplicationDetails />,
         },
 
         {
           path:
             'internships',
 
           element:
             <Internships />,
         },

         {
           path: 'training-planning',
           element: <TrainingPlanning />,
         },

         {
           path: 'intern-progress',
           element: <InternProgressPage />,
         },
       ],
     },

     {
       path: '/intern',
       element: <InternRoute />,
       children: [
         { index: true, element: <InternDashboard /> },
         { path: 'dashboard', element: <InternDashboard /> },
         { path: 'my-internship', element: <MyInternship /> },
         { path: 'tasks', element: <AssignedTasks /> },
         { path: 'training-reports', element: <TrainingReports /> },
         { path: 'profile', element: <InternProfile /> },
       ],
     },

     {
       path: '/mentor',
       element: (
         <RoleGuard allowedRoles={['MENTOR']}>
           <MentorLayout />
         </RoleGuard>
       ),
       children: [
         { index: true, element: <MentorDashboard /> },
         { path: 'dashboard', element: <MentorDashboard /> },
       ],
     },
 
     {
       path: '/admin',
       element: (
         <RoleGuard allowedRoles={['ADMIN']}>
           <AdminLayout />
         </RoleGuard>
       ),
       children: [
         { index: true, element: <Navigate to="dashboard" replace /> },
         { path: 'dashboard', element: <AdminDashboard /> },
         { path: 'users', element: <UserManagement /> },
         { path: 'roles', element: <RolesPermissions /> },
         { path: 'settings', element: <SystemSettings /> },
       ],
     },

     {
         path:
         '/login',
 
       element:
         <Login />,
     },
 
     {
       path:
         '/applicant/profile',
 
       element: (
         <RoleGuard
           allowedRoles={[
             'APPLICANT',
           ]}
         >
           <ApplicantProfile />
         </RoleGuard>
       ),
     },
 
     {
       path:
         '/internships',
 
       element:
         <PublicInternships />,
     },
 
     {
       path: '*',
 
       element:
         <NotFoundPage />,
     },
   ]);
