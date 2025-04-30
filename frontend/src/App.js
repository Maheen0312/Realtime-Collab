import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Room from "./pages/Room";
import Login from "./pages/Login";        
import Signup from "./pages/Signup";     
import { SocketProvider } from "./socketContext";
import './styles/index.css';
import { io } from "socket.io-client";
const socket = io(process.env.REACT_APP_API_URL || "");


function App() {
  return (
    <SocketProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />    
          <Route path="/signup" element={<Signup />} />   
          <Route path="/room/:roomId" element={<Room socket={socket} />} />
        </Routes>
      </Router>
    </SocketProvider>
  );
}

export default App;
