import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'

export default function AppLayout() {
  return (
    <>
      <Navbar />
      <div style={{ paddingTop: 56 }}>
        <Outlet />
      </div>
    </>
  )
}
