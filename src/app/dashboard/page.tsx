import { redirect } from 'next/navigation';

// Old Edgelog links pointed here.
export default function Dashboard() {
  redirect('/journal');
}
