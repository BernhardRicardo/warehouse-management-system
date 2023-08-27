import { db } from 'firebase';
import { collection, doc, getDocs, query, updateDoc } from 'firebase/firestore';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SingleTableItem } from 'renderer/components/TableComponents/SingleTableItem';
import { TableHeader } from 'renderer/components/TableComponents/TableHeader';
import { TableTitle } from 'renderer/components/TableComponents/TableTitle';
import { Supplier } from 'renderer/interfaces/Supplier';
import { PageLayout } from 'renderer/layout/PageLayout';

export default function SupplierList() {
  const [supplierList, setSupplierList] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [telephone, setTelephone] = useState<string[]>([]);
  const [updatedProduct, setUpdatedProduct] = useState('');
  const [editingIndex, setEditingIndex] = useState<number>(-1);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editTelephoneToggle, setEditTelephoneToggle] = useState(false);
  const navigate = useNavigate();
  // Take product from firebase
  useEffect(() => {
    const fetchData = async () => {
      try {
        const q = query(collection(db, 'supplier'));
        const querySnapshot = await getDocs(q);

        const supplierData: Supplier[] = [];
        querySnapshot.forEach((theProduct) => {
          const data = theProduct.data() as Supplier;
          data.id = theProduct.id;
          supplierData.push(data);
        });

        setSupplierList(supplierData);
        setTelephone(supplierData.map((supplier) => supplier.phone_number));
        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData().catch((error) => {
      console.log(error);
    });
  }, []);

  const handleEditClick = (index: number) => {
    setEditingIndex(index); // Set the editing index to enable editing for this row
  };

  const handleBlur = () => {
    setEditingIndex(-1); // Reset the editing index when blurred
  };
  const handleTelephoneChange = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const supplier = supplierList[editingIndex];
    if (!supplier.id) return;
    const supplierRef = doc(db, 'supplier', supplier.id);

    const updatedSupplier = {
      ...supplier,
      phone_number: supplier.phone_number,
    };

    updateDoc(supplierRef, updatedSupplier).catch((error) => {
      console.error('Error updating document: ', error);
    });

    setEditTelephoneToggle(false);
  };

  function handleSubmit(e: { preventDefault: () => void }) {
    e.preventDefault();
    // Declare the index
    const index = 0;

    setEditingIndex(-1);
    inputRef.current?.blur();
  }
  return (
    <PageLayout>
      <h1 className="mb-[4rem] text-4xl font-extrabold tracking-tight text-gray-900 md:text-5xl">
        List Supplier
      </h1>
      <div className="w-full h-full bg-transparent overflow-hidden">
        <div className="relative shadow-md sm:rounded-lg overflow-auto h-full flex flex-col justify-between">
          <TableTitle setSearch={setSearch}>
            <button
              type="button"
              className="px-4 py-2 font-medium text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 rounded-lg text-sm flex justify-center"
              onClick={() => navigate('/inputsupplier')}
            >
              Create new supplier
            </button>
          </TableTitle>
          <div className="overflow-y-auto h-full">
            <table className="w-full text-sm text-left text-gray-500">
              <TableHeader>
                <th className="px-4 py-3">Factory Name</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Telephone</th>
                <th className="px-4 py-3">Bank Account</th>
                <th className="px-4 py-3"></th>
              </TableHeader>
              <tbody className="overflow-y-auto">
                {supplierList.map((supplier: Supplier, index) => (
                  <tr
                    key={index}
                    className="border-b hover:shadow-md cursor-pointer"
                  >
                    <SingleTableItem>{supplier.company_name} </SingleTableItem>
                    <SingleTableItem>
                      {supplier.address}, {supplier.city}
                    </SingleTableItem>
                    <SingleTableItem>{supplier.phone_number}</SingleTableItem>
                    <SingleTableItem>
                      <span className="font-medium text-md">
                        {supplier.bank_number}
                      </span>
                      <br />
                      <span className="font-light text-xs">
                        {supplier.bank_owner}
                      </span>
                    </SingleTableItem>
                    <SingleTableItem>
                      <button
                        type="button"
                        className="text-gray-500 p-2 hover:text-gray-700 cursor-pointer bg-gray-100 rounded-md"
                        onClick={() => {
                          navigate('/transactionhistory');
                        }}
                      >
                        Purchase History
                      </button>
                    </SingleTableItem>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-row-reverse gap-2 w-full justify-start">
            <button
              type="submit"
              className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 focus:outline-none hover:-translate-y-1 "
              style={{
                width: '100px', // Adjust the width as needed
                height: '40px', // Adjust the height as needed
              }}
              onClick={() => navigate('/inputsupplier')}
            >
              + New
            </button>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}