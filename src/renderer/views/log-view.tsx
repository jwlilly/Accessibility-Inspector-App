import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Modal } from 'react-daisyui';

const Logs = function Logs({ messages }: any) {
  const [modalOpen, setModalOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const handleShow = useCallback(() => {
    ref.current?.showModal();
    setModalOpen(true);
  }, [ref]);

  const handleClose = useCallback(() => {
    setModalOpen(false);
  }, []);

  return (
    <div>
      <Button aria-label="Logs" onClick={handleShow} color="ghost">
        <InformationCircleIcon title="Logs" className="h-[24px]" />
      </Button>
      <Modal
        ref={ref}
        ariaHidden={!modalOpen}
        onClose={handleClose}
        className="w-11/12 max-w-5xl"
      >
        <Modal.Header tabIndex={-1} className="font-bold scroll">
          Message Log
        </Modal.Header>
        <Modal.Body>
          <table className="table mx-2 table-zebra-zebra">
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[30%}" />
              <col className="w-[50%]" />
            </colgroup>
            <thead className="text-primary-content bg-primary">
              <tr>
                <th>timestamp</th>
                <th>type</th>
                <th>message</th>
              </tr>
            </thead>
            <tbody>
              {messages !== null && messages.length > 0
                ? messages.map(
                    (message: {
                      time: string;
                      message: string;
                      type: string;
                    }) => {
                      return (
                        <tr key={message.time}>
                          <td>{message.time}</td>
                          <td>{message.type}</td>
                          <td>{message.message}</td>
                        </tr>
                      );
                    },
                  )
                : null}
              <tr />
            </tbody>
          </table>
        </Modal.Body>
        <Modal.Actions>
          <form method="dialog">
            <Button tabIndex={!modalOpen ? -1 : 0}>Close</Button>
          </form>
        </Modal.Actions>
      </Modal>
    </div>
  );
};

export default Logs;
