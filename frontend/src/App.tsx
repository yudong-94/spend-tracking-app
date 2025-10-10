// import React from 'react';
import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Analytics from "./pages/Analytics";
import AddTransaction from "./pages/AddTransaction";
import Budget from "@/pages/Budget";
import SavingsRunner from "./pages/SavingsRunner";

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/add" element={<AddTransaction />} />
        <Route path="/budget" element={<Budget />} />
        <Route path="/savings-runner" element={<SavingsRunner />} />
      </Routes>
    </Layout>
  );
}

export default App;
