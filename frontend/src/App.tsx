// import React from 'react';
import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Analytics from "./pages/Analytics";
import AddTransaction from "./pages/AddTransaction";
import Budget from "@/pages/Budget";
import Subscriptions from "@/pages/Subscriptions";
import Benefits from "@/pages/Benefits";

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/subscriptions" element={<Subscriptions />} />
        <Route path="/benefits" element={<Benefits />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/add" element={<AddTransaction />} />
        <Route path="/budget" element={<Budget />} />
      </Routes>
    </Layout>
  );
}

export default App;
