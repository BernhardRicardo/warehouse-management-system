import { db } from 'firebase';
import {
  addDoc,
  and,
  collection,
  doc,
  getDoc,
  getDocs,
  or,
  query,
  runTransaction,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useState } from 'react';
import { AiOutlineLoading3Quarters, AiOutlineReload } from 'react-icons/ai';
import { BiSolidTrash } from 'react-icons/bi';
import { useNavigate } from 'react-router-dom';
import { InputField } from 'renderer/components/InputField';
import { SingleTableItem } from 'renderer/components/TableComponents/SingleTableItem';
import { TableModal } from 'renderer/components/TableComponents/TableModal';
import { Customer } from 'renderer/interfaces/Customer';
import { Product } from 'renderer/interfaces/Product';
import { PageLayout } from 'renderer/layout/PageLayout';

export default function ReturnPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<'return' | 'exchange' | 'void' | ''>('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [checkedItems, setCheckedItems] = useState<boolean[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [invoice, setInvoice] = useState<{
    customer_id: string;
    customer_name: string;
    total_price: string;
    payment_method: string;
    items: {
      product_id: string;
      amount: string;
      price: string;
      product_name: string;
      warehouse_position: string;
      is_returned: boolean;
    }[];
  }>({
    customer_id: '',
    customer_name: '',
    total_price: '',
    payment_method: '',
    items: [],
  });
  const [newTransaction, setNewTransaction] = useState<{
    customer_id: string;
    customer_name: string;
    total_price: string;
    payment_method: string;
    items: {
      product_id: string;
      amount: string;
      price: string;
      product_name: string;
      warehouse_position: string;
      is_returned: boolean;
    }[];
  }>({
    customer_id: '',
    customer_name: '',
    total_price: '',
    payment_method: '',
    items: [],
  });
  const [selectedItems, setSelectedItems] = useState<
    {
      product_id: string;
      amount: string;
      price: string;
      product_name: string;
      warehouse_position: string;
      is_returned: boolean;
    }[]
  >([]);
  const [selectedNewItems, setSelectedNewItems] = useState<
    {
      product_id: string;
      amount: string;
      price: string;
      product_name: string;
      warehouse_position: string;
      is_returned: boolean;
    }[]
  >([]);

  const getSpecialPriceForProduct = (productId: String) => {
    const specialPrice = selectedCustomer?.SpecialPrice.find(
      (p) => p.product_id === productId
    );
    return specialPrice ? specialPrice.price : null;
  };

  const handleSubmit = async () => {
    // If mode is exchange, check if there is enough stock
    if (mode === 'exchange')
      await runTransaction(db, async (transaction) => {
        try {
          const promises = selectedItems.map(async (item) => {
            // Get product data
            const productRef = doc(db, 'product', item.product_id);
            const productSnap = await getDoc(productRef);
            const product = productSnap.data() as Product;

            // Check if there is enough stock
            if (parseInt(product.count) < parseInt(item.amount))
              return Promise.reject('Not enough stock in the warehouse');

            // Update product count
            const difference = parseInt(product.count) - parseInt(item.amount);
            transaction.update(
              doc(db, 'product', item.product_id),
              'count',
              difference.toString()
            );

            // Put the returned product to broken product database
            await checkBrokenProduct(product, item.amount);
            return Promise.resolve('Success');
          });
          await Promise.all(promises);
          return Promise.resolve('Success'); // If all promises are resolved, return 'Success
        } catch (err) {
          return Promise.reject(err);
        }
      });
    else if (mode === 'return') {
      const newTransaction = { ...invoice };
      // Decrease the amount of the item in the invoice
      // If amount is 0, delete the item from the invoice
      selectedItems.forEach((selectedItem) => {
        const itemIndex = newTransaction.items.findIndex(
          (item) => item.product_id === selectedItem.product_id
        );
        if (
          parseInt(newTransaction.items[itemIndex].amount) ===
          parseInt(selectedItem.amount)
        )
          // Delete the item
          newTransaction.items.splice(itemIndex, 1);
        else
          newTransaction.items[itemIndex].amount = (
            parseInt(newTransaction.items[itemIndex].amount) -
            parseInt(selectedItem.amount)
          ).toString();
      });

      // Reduce the total price
      newTransaction.total_price = (
        parseInt(newTransaction.total_price) -
        selectedItems.reduce(
          (acc, cur) => acc + parseInt(cur.price) * parseInt(cur.amount),
          0
        )
      ).toString();

      // Merge the invoice items with the selected items
      // But if the item is already in the invoice, just increase the amount
      selectedItems.forEach((selectedItem) => {
        selectedItem.is_returned = true;
        const itemIndex = newTransaction.items.findIndex(
          (item) => item.product_id === selectedItem.product_id
        );
        if (itemIndex === -1) newTransaction.items.push(selectedItem);
        else
          newTransaction.items[itemIndex].amount = (
            parseInt(newTransaction.items[itemIndex].amount) -
            parseInt(selectedItem.amount)
          ).toString();
      });

      // Update the invoice
      await runTransaction(db, (transaction) => {
        transaction.update(doc(db, 'invoice', invoiceNumber), {
          items: newTransaction.items,
          total_price: newTransaction.total_price,
        });

        // Put the returned product to broken product database
        const promises = selectedItems.map(async (item) => {
          // Get product data
          const productRef = doc(db, 'product', item.product_id);
          const productSnap = await getDoc(productRef);
          const product = productSnap.data() as Product;

          // Check if there is enough stock
          await checkBrokenProduct(product, item.amount);
          return Promise.resolve();
        });

        return Promise.all(promises);
      });
    } else if (mode === 'void') {
      // TO DO: Handle void transaction
      await runTransaction(db, (transaction) => {
        // Delete the invoice
        transaction.delete(doc(db, 'invoice', invoiceNumber));
        //put the invoice to void list
        transaction.set(doc(db, 'void_invoice', invoiceNumber), {
          ...invoice,
          items: checkedItems.map((checkedItem, index) => {
            return {
              ...invoice.items[index],
              is_returned: true,
            };
          }),
        });

        console.log('new', newTransaction);
        //to-do: add new transaction

        return Promise.resolve();
      });
    }
    // Clear the form
    setInvoiceNumber('');
    setCheckedItems([]);
    setInvoice({
      customer_id: '',
      customer_name: '',
      total_price: '',
      payment_method: '',
      items: [],
    });
    setSelectedItems([]);
    setMode('');
    setNewTransaction({
      customer_id: '',
      customer_name: '',
      total_price: '',
      payment_method: '',
      items: [],
    });
    setLoading(false);
  };

  const checkBrokenProduct = async (
    product: Product | undefined,
    amount: string
  ) => {
    if (!product) return;
    // Check if the product is already in broken product database
    const brokenProductQuery = query(
      collection(db, 'broken_product'),
      where('warehouse_position', '==', 'Gudang Jadi'),
      where('available_color', '==', product.available_color),
      where('brand', '==', product.brand),
      where('motor_type', '==', product.motor_type),
      where('part', '==', product.part),
      where('supplier', '==', product.supplier)
    );

    const brokenProductQuerySnapshot = await getDocs(brokenProductQuery);

    if (brokenProductQuerySnapshot.empty)
      await addDoc(collection(db, 'broken_product'), {
        ...product,
        count: amount,
        warehouse_position: 'Gudang Jadi',
      });
    else {
      // Update broken product count
      const brokenProduct = brokenProductQuerySnapshot.docs[0];

      await updateDoc(brokenProduct.ref, {
        count:
          parseInt(amount) + parseInt((brokenProduct.data() as Product).count),
      });
    }
  };

  const handleFetchCustomer = async () => {
    console.log('fetching customer');
    const customerRef = doc(db, 'customer', invoice.customer_id);
    const customerSnap = await getDoc(customerRef);
    const customerData = customerSnap.data() as Customer;
    setSelectedCustomer(customerData);
    console.log(customerData);
  };

  const handleFetchInvoice = async () => {
    if (!invoiceNumber) return;

    try {
      setLoading(true);
      const invoiceRef = doc(db, 'invoice', invoiceNumber);
      const invoiceSnap = await getDoc(invoiceRef);
      const invoiceData = invoiceSnap.data() as {
        customer_id: string;
        customer_name: string;
        total_price: string;
        payment_method: string;
        items: {
          product_id: string;
          amount: string;
          price: string;
          product_name: string;
          warehouse_position: string;
          is_returned: boolean;
        }[];
      } | null;

      if (!invoiceData) {
        setErrorMessage('Invoice not found');
        setTimeout(() => {
          setErrorMessage(null);
        }, 3000);
        setLoading(false);
        return;
      }

      setInvoice(invoiceData);

      setCheckedItems(new Array(invoiceData.items.length).fill(false));
      setLoading(false);
    } catch (err) {
      setErrorMessage('An error occured while fetching invoice');
      setLoading(false);
    }
  };

  const handleSearch = async (search: string) => {
    const productsQuery = query(
      collection(db, 'product'),
      or(
        // Query as-is:
        and(
          where('brand', '>=', search),
          where('brand', '<=', search + '\uf8ff')
        ),
        // Capitalize first letter:
        and(
          where(
            'brand',
            '>=',
            search.charAt(0).toUpperCase() + search.slice(1)
          ),
          where(
            'brand',
            '<=',
            search.charAt(0).toUpperCase() + search.slice(1) + '\uf8ff'
          )
        ),
        // Lowercase:
        and(
          where('brand', '>=', search.toLowerCase()),
          where('brand', '<=', search.toLowerCase() + '\uf8ff')
        )
      )
    );
    const querySnapshot = await getDocs(productsQuery);
    const products: Product[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as Product;
      data.id = doc.id;
      products.push(data);
    });
    setProducts(products);
  };

  return (
    <PageLayout>
      <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 md:text-5xl pt-4">
        Return
      </h1>
      <form
        onSubmit={(e) => {
          () => handleFetchInvoice();
        }}
        className={`w-2/3 pt-14 mt-10 flex flex-col gap-3 relative${
          loading ? 'p-2' : ''
        }`}
      >
        {loading && (
          <div className="absolute flex justify-center items-center py-2 px-3 top-0 left-0 w-full h-full bg-gray-50 rounded-lg z-0">
            <AiOutlineLoading3Quarters className="animate-spin flex justify-center text-4xl" />
          </div>
        )}
        <div className="flex justify-between">
          <div className="w-1/3 flex items-center">
            <label htmlFor={'change-of-stock-mode'} className="text-md">
              Change of stock mode
            </label>
          </div>
          <div className="w-2/3">
            <select
              value={mode}
              disabled={loading}
              name="change-of-stock-mode"
              onChange={(e) => {
                if (
                  e.target.value === 'return' ||
                  e.target.value === 'exchange' ||
                  e.target.value === 'void'
                )
                  setMode(e.target.value);
              }}
              className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
            >
              <option value={''} disabled>
                Select mode
              </option>
              <option value={'return'}>Return</option>
              <option value={'exchange'}>Exchange</option>
              <option value={'void'}>Void</option>
            </select>
          </div>
        </div>
        <div className="flex items-center relative">
          <InputField
            loading={loading}
            label="Invoice number"
            labelFor="invoice-number"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            additionalStyle="pr-10"
          />
          <button
            type="submit"
            disabled={loading}
            className="absolute top-0 right-0 h-full flex items-center justify-center px-3"
            onClick={() => {
              console.log('clicked');
              handleFetchInvoice().catch(() => console.log('error'));
              handleFetchCustomer().catch(() => console.log('error'));
              console.log(selectedCustomer);
            }}
          >
            <AiOutlineReload />
          </button>
        </div>
      </form>

      {invoice.items.length > 0 && (
        // Invoice data
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit().catch((e: string) => {
              setErrorMessage(e);
              setTimeout(() => {
                setErrorMessage(null);
              }, 3000);
            });
          }}
          className={`w-2/3 flex flex-col gap-3 relative ${
            loading ? 'p-2' : ''
          }`}
        >
          <div className="my-3 space-y-3 font-regular">
            <hr />
            <h1 className="text-2xl font-bold">Invoice Details</h1>
            <div className="flex flex-col gap-3">
              <div className="flex justify-between">
                <p className="text-md">Customer</p>
                <p className="text-md">{invoice.customer_name}</p>
              </div>
              <div className="flex justify-between">
                <p className="text-md">Total price</p>
                <p className="text-md">
                  {new Intl.NumberFormat('id-ID', {
                    style: 'currency',
                    currency: 'IDR',
                  }).format(parseInt(invoice.total_price))}
                </p>
              </div>
              <div className="flex justify-between">
                <p className="text-md">Payment method</p>
                <p className="text-md">{invoice.payment_method}</p>
              </div>
              <ul className="my-3 space-y-3 font-regular">
                {invoice.items.map((item, index) => (
                  <li key={index}>
                    <div className="w-full flex justify-between items-center">
                      <div
                        className={`flex ${
                          checkedItems[index] ? 'w-4/5' : 'w-full'
                        }`}
                      >
                        <div className="pt-1">
                          <input
                            type="checkbox"
                            checked={checkedItems[index] || mode === 'void'}
                            disabled={item.is_returned || mode === 'void'}
                            onChange={() => {
                              const newCheckedItems = checkedItems;
                              newCheckedItems[index] = !newCheckedItems[index];
                              setCheckedItems([...newCheckedItems]);
                              if (newCheckedItems[index])
                                setSelectedItems([...selectedItems, item]);
                              else {
                                const newSelectedItems = selectedItems.filter(
                                  (selectedItem) =>
                                    selectedItem.product_id !== item.product_id
                                );
                                setSelectedItems([...newSelectedItems]);
                              }
                            }}
                          />
                        </div>
                        <div className="px-3">
                          <label className="text-lg font-semibold">
                            {item.amount + 'x ' + item.product_name}
                            {item.is_returned && ' (Returned)'}
                          </label>
                        </div>
                      </div>
                      {checkedItems[index] && (
                        <div className="w-1/5">
                          <input
                            disabled={loading || mode === 'return'}
                            id={'amount'}
                            name={'amount'}
                            type="number"
                            className="placeholder:text-xs placeholder:font-light bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2 w-full
                            "
                            value={
                              // If mode is return, set the amount to the original amount
                              mode === 'return'
                                ? item.amount
                                : selectedItems.find(
                                    (selectedItem) =>
                                      selectedItem.product_id ===
                                      item.product_id
                                  )?.amount
                            }
                            onChange={(e) => {
                              const newAmount = e.target.value;
                              // If amount is not a number > 0, set it to 1
                              if (
                                isNaN(parseInt(newAmount)) ||
                                parseInt(newAmount) <= 0
                              ) {
                                e.target.value = '1';
                                return;
                              }
                              if (
                                parseInt(newAmount) <= parseInt(item.amount)
                              ) {
                                // Check if newAmount is smaller or equal to item.amount
                                const newSelectedItems = [...selectedItems];
                                const selectedItemIndex =
                                  newSelectedItems.findIndex(
                                    (selectedItem) =>
                                      selectedItem.product_id ===
                                      item.product_id
                                  );
                                if (selectedItemIndex !== -1) {
                                  newSelectedItems[selectedItemIndex] = {
                                    ...newSelectedItems[selectedItemIndex],
                                    amount: newAmount,
                                  };
                                  setSelectedItems(newSelectedItems);
                                  setErrorMessage(null); // Clear any previous error message
                                }
                              } else {
                                setErrorMessage(
                                  'Amount cannot be more than the original amount'
                                );
                                e.target.value = e.target.value.slice(0, -1);
                                setTimeout(() => {
                                  setErrorMessage(null);
                                }, 3000);
                              }
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {mode === 'void' && (
            <div
              className={`w-full py-10 flex flex-col gap-3 relative ${
                loading ? 'p-2' : ''
              }`}
            >
              <hr className="my-3" />
              <h1 className="text-2xl font-bold">New Transaction</h1>
              <ul className="my-3 space-y-3 font-regular">
                {selectedNewItems.map((newItem, newIndex) => (
                  <li key={newIndex}>
                    <div className="flex flex-row">
                      <div className="flex flex-col gap-2 w-full">
                        <div className="flex w-full justify-between">
                          <p className="text-lg font-semibold">
                            {newItem.product_name}
                          </p>
                          <button
                            type="button"
                            className="text-red-500 text-lg p-2 hover:text-red-700 cursor-pointer bg-transparent rounded-md"
                            onClick={() => {
                              setSelectedNewItems(
                                selectedNewItems.filter(
                                  (item) =>
                                    item.product_id !== newItem.product_id
                                )
                              );
                              setSelectedProducts(
                                selectedProducts.filter(
                                  (p) => p.id !== newItem.product_id
                                )
                              );
                            }}
                          >
                            <BiSolidTrash />
                          </button>
                        </div>
                        <InputField
                          label="new amount"
                          labelFor="new amount"
                          loading={loading}
                          value={selectedNewItems[newIndex]?.amount}
                          onChange={(e) => {
                            const newAmount = e.target.value;
                            if (isNaN(Number(newAmount))) return;
                            if (
                              parseInt(e.target.value) >
                              parseInt(selectedProducts[newIndex].count) +
                                parseInt(
                                  invoice.items.find(
                                    (item) =>
                                      item.product_id ===
                                      selectedProducts[newIndex].id
                                  )?.amount ?? '0'
                                )
                            ) {
                              setErrorMessage(
                                'Amount cannot be more than the original amount'
                              );
                              e.target.value = e.target.value.slice(0, -1);
                              setTimeout(() => {
                                setErrorMessage(null);
                              }, 3000);
                              return;
                            }

                            // Use map to create a new array with updated amount
                            const updatedSelectedNewItems =
                              selectedNewItems.map((item, i) => {
                                if (i === newIndex) {
                                  return {
                                    ...item,
                                    amount: newAmount,
                                  };
                                }
                                return item;
                              });

                            setSelectedNewItems(updatedSelectedNewItems);
                            setNewTransaction({
                              ...newTransaction,
                              items: updatedSelectedNewItems,
                            });
                          }}
                        />

                        <div className="flex justify-end">
                          <p className="text-md">
                            {new Intl.NumberFormat('id-ID', {
                              style: 'currency',
                              currency: 'IDR',
                            }).format(
                              parseInt(
                                selectedNewItems[newIndex]?.amount ?? '0'
                              ) * parseInt(selectedNewItems[newIndex].price)
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="flex justify-end">
                <p className="text-lg font-semibold">Total: &nbsp;</p>
                <p className="text-lg font-semibold">
                  {new Intl.NumberFormat('id-ID', {
                    style: 'currency',
                    currency: 'IDR',
                  }).format(
                    selectedNewItems.reduce(
                      (acc, item) =>
                        acc + parseInt(item.price) * parseInt(item.amount),
                      0
                    )
                  )}
                </p>
              </div>

              <button
                type="button"
                className="w-full py-2 px-5 text-sm font-medium text-red-500 focus:outline-none bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-red-700 focus:z-10 focus:ring-4 focus:ring-gray-200 disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-red-500"
                disabled={loading}
                onClick={() => setModalOpen(true)}
              >
                Choose Products
              </button>

              <hr />

              <div className="w-full flex justify-between items-center">
                <div className="w-1/3">
                  <label htmlFor={'payment-method'} className="text-md">
                    Payment Method
                  </label>
                </div>
                <div className="w-2/3 flex justify-start">
                  <div className="w-full">
                    <label
                      htmlFor="cash"
                      className="flex items-center text-center gap-[0.5rem] cursor-pointer w-[max-content]"
                    >
                      Cash
                      <input
                        type="radio"
                        disabled={loading}
                        name="payment-method"
                        id="cash"
                        value="Cash"
                        checked={newTransaction.payment_method === 'Cash'}
                        onChange={(e) => {
                          console.log(e.target.value);
                          setNewTransaction({
                            ...newTransaction,
                            payment_method: e.target.value,
                          });
                        }}
                        className="cursor-pointer"
                      />
                    </label>
                  </div>
                  <div className="w-full">
                    <label
                      htmlFor="cashless"
                      className="flex items-center text-center gap-[0.5rem] cursor-pointer w-[max-content]"
                    >
                      Cashless
                      <input
                        type="radio"
                        disabled={loading}
                        name="payment-method"
                        id="cashless"
                        value="Cashless"
                        checked={newTransaction.payment_method === 'Cashless'}
                        onChange={(e) => {
                          console.log(e.target.value);
                          setNewTransaction({
                            ...newTransaction,
                            payment_method: e.target.value,
                          });
                        }}
                        className="cursor-pointer"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-row-reverse gap-2 justify-start">
            <button
              disabled={loading}
              type="submit"
              className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5"
            >
              Submit
            </button>
            <button
              disabled={loading}
              type="button"
              className="py-2.5 px-5 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-200"
              onClick={() => navigate(-1)}
            >
              Cancel
            </button>
          </div>
          {errorMessage && (
            <p className="text-red-500 text-sm ">{errorMessage}</p>
          )}
        </form>
      )}

      <TableModal
        placeholder="Search by product brand"
        modalOpen={modalOpen}
        setModalOpen={setModalOpen}
        handleSearch={handleSearch}
        title={'Choose Product'}
        headerList={
          products.length > 0
            ? ['', 'Product name', 'Warehouse', 'Available amount', 'Price']
            : []
        }
      >
        {products.length > 0 ? (
          products.map((product, index) => (
            <tr
              key={index}
              className="hover:bg-gray-100 cursor-pointer"
              onClick={() => {
                if (selectedProducts.some((p) => p.id === product.id)) {
                  setSelectedProducts(
                    selectedProducts.filter((p) => p.id !== product.id)
                  );
                  console.log(selectedProducts);
                  setNewTransaction({
                    ...newTransaction,
                    items: newTransaction.items.filter(
                      (p) => p.product_id !== product.id
                    ),
                  });
                } else {
                  if (!product.id) return;
                  const specialPrice = getSpecialPriceForProduct(product.id);
                  setSelectedProducts([...selectedProducts, product]);
                  setSelectedNewItems([
                    ...selectedNewItems,
                    {
                      product_id: product.id,
                      amount: '1',
                      price:
                        specialPrice !== null
                          ? specialPrice
                          : product.sell_price,
                      product_name:
                        product.brand +
                        ' ' +
                        product.motor_type +
                        ' ' +
                        product.part +
                        ' ' +
                        product.available_color,
                      warehouse_position: product.warehouse_position,
                      is_returned: false,
                    },
                  ]);
                  setNewTransaction({
                    ...newTransaction,
                    items: [
                      ...newTransaction.items,
                      {
                        product_id: product.id,
                        amount: '1',
                        price:
                          specialPrice !== null
                            ? specialPrice
                            : product.sell_price,
                        product_name:
                          product.brand +
                          ' ' +
                          product.motor_type +
                          ' ' +
                          product.part +
                          ' ' +
                          product.available_color,
                        warehouse_position: product.warehouse_position,
                        is_returned: false,
                      },
                    ],
                  });
                  console.log(selectedNewItems);
                }
              }}
            >
              <SingleTableItem>
                <input
                  type="checkbox"
                  checked={selectedProducts.includes(product)}
                  readOnly
                />
              </SingleTableItem>
              <SingleTableItem key={index}>
                {product.brand +
                  ' ' +
                  product.motor_type +
                  ' ' +
                  product.part +
                  ' ' +
                  product.available_color}
              </SingleTableItem>
              <SingleTableItem>{product.warehouse_position}</SingleTableItem>
              <SingleTableItem>{product.count}</SingleTableItem>
              <SingleTableItem>{product.sell_price}</SingleTableItem>
            </tr>
          ))
        ) : (
          <tr className="border-b">
            <SingleTableItem>
              <p className="flex justify-center">No products found</p>
            </SingleTableItem>
          </tr>
        )}
      </TableModal>
    </PageLayout>
  );
}
