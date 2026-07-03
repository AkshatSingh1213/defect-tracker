import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import QADashboard from './pages/QADashboard';
import DevDashboard from './pages/DevDashboard';
import PMDashboard from './pages/PMDashboard';
import AdminPanel from './pages/AdminPanel';
import DefectDetail from './pages/DefectDetail';
import DefectList from './pages/DefectList';
import Layout from './components/Layout';

const RoleRoute = ({ children, roles }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
};

const HomeRedirect = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'qa') return <Navigate to="/qa" replace />;
  if (user.role === 'developer') return <Navigate to="/dev" replace />;
  if (user.role === 'pm') return <Navigate to="/pm" replace />;
  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  return <Navigate to="/login" replace />;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<HomeRedirect />} />
          <Route element={<Layout />}>
            <Route path="/qa" element={<RoleRoute roles={['qa']}><QADashboard /></RoleRoute>} />
            <Route path="/dev" element={<RoleRoute roles={['developer']}><DevDashboard /></RoleRoute>} />
            <Route path="/pm" element={<RoleRoute roles={['pm']}><PMDashboard /></RoleRoute>} />
            <Route path="/admin" element={<RoleRoute roles={['admin']}><AdminPanel /></RoleRoute>} />
            <Route path="/defects" element={<RoleRoute roles={['qa','developer','pm','admin']}><DefectList /></RoleRoute>} />
            <Route path="/defects/:id" element={<RoleRoute roles={['qa','developer','pm','admin']}><DefectDetail /></RoleRoute>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
